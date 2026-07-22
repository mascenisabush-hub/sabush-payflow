import React, { useEffect } from 'react';
import { collection, query, where, getDocs, doc, increment, serverTimestamp, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cascadeStockDeduction } from '../lib/stockDeduction';
import { useAuth } from '../contexts/AuthContext';

export default function ClientInventorySync() {
  const { profile, user } = useAuth();

  useEffect(() => {
    // Only run if the user is authenticated and is a business staff or owner (not demo business)
    if (!user || !profile?.businessId || profile.businessId === "demo_business_123") return;

    const isStaff = ['owner', 'business_owner', 'staff', 'manager', 'cashier', 'accountant', 'super_admin'].includes(profile.role || '');
    if (!isStaff) return;

    const runSync = async () => {
      try {
        const businessId = profile.businessId;

        // Query accepted orders and filter branchSyncCompleted client-side to avoid requiring composite indexes
        const q = query(
          collection(db, `businesses/${businessId}/online_orders`),
          where("status", "==", "accepted")
        );

        const ordersSnap = await getDocs(q);
        const pendingOrders = ordersSnap.docs.filter(doc => doc.data().branchSyncCompleted !== true);
        if (pendingOrders.length === 0) return;

        console.info(`[Client Sync] Found ${pendingOrders.length} online orders pending branch stock sync.`);

        // Get all branches for this business
        const branchesSnap = await getDocs(collection(db, `businesses/${businessId}/branches`));
        const branches = branchesSnap.docs.map(bDoc => ({ id: bDoc.id, ...bDoc.data() }));

        if (branches.length === 0) return;

        for (const orderDoc of pendingOrders) {
          const orderId = orderDoc.id;
          const orderData = orderDoc.data();
          const items = orderData.items || [];

          for (const item of items) {
            const productId = item.id || item.productId;
            if (!productId) continue;

            const qty = Number(item.quantity) || 0;
            if (qty <= 0) continue;

            // Update product stock across all branches
            for (const branch of branches) {
              const branchProductRef = doc(db, `businesses/${businessId}/branches/${branch.id}/products/${productId}`);
              const branchProductSnap = await getDoc(branchProductRef);

              if (branchProductSnap.exists()) {
                // Decrement branch specific stock level, cascading Emb/Cx into loose Un if needed
                const branchProdData = branchProductSnap.data();
                const { stockCx, stockEmb, stockUn } = cascadeStockDeduction(branchProdData, 'un', qty);
                await updateDoc(branchProductRef, {
                  stockLevel: increment(-qty),
                  stockCx,
                  stockEmb,
                  stockUn,
                  updatedAt: serverTimestamp()
                });
                console.info(`[Client Sync] Deducted ${qty} of product ${productId} from branch ${branch.id}`);
              } else {
                // If the product record doesn't exist under branch, load main product and copy with initial deducted stock
                const mainProductRef = doc(db, `businesses/${businessId}/products/${productId}`);
                const mainProductSnap = await getDoc(mainProductRef);
                if (mainProductSnap.exists()) {
                  const mainProductData = mainProductSnap.data();
                  if (mainProductData) {
                    const initialStock = Number(mainProductData.stockLevel || mainProductData.stockUn || 0);
                    const newStock = Math.max(0, initialStock - qty);

                    await setDoc(branchProductRef, {
                      ...mainProductData,
                      stockLevel: newStock,
                      stockUn: newStock,
                      branchId: branch.id,
                      businessId: businessId,
                      createdAt: serverTimestamp(),
                      updatedAt: serverTimestamp()
                    });
                    console.info(`[Client Sync] Initialized product ${productId} in branch ${branch.id} with stock ${newStock}`);
                  }
                }
              }
            }
          }

          // Mark this online order branch sync as completed
          const orderDocRef = doc(db, `businesses/${businessId}/online_orders/${orderId}`);
          await updateDoc(orderDocRef, {
            branchSyncCompleted: true,
            branchSyncedAt: serverTimestamp()
          });

          console.info(`[Client Sync] Successfully synchronized branch inventory for accepted order: ${orderId}`);
        }
      } catch (err) {
        console.error("[Client Sync] Error running background inventory sync:", err);
      }
    };

    // Run first time in 5 seconds, then every 30 seconds
    const initialTimeout = setTimeout(() => {
      runSync();
    }, 5000);

    const syncInterval = setInterval(runSync, 30000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(syncInterval);
    };
  }, [profile?.businessId, profile?.role]);

  return null;
}
