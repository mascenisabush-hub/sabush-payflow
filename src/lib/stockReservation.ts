import { db } from './firebase';
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';

/**
 * Recalculates and updates the reservedStock field on products in Firestore
 * based on all active, non-expired quotations for a given business.
 */
export const syncReservedStock = async (businessId: string, productIdsToSync?: string[]) => {
  if (!businessId) return;
  try {
    // 1. Fetch all quotations for this business
    const quotationsRef = collection(db, `businesses/${businessId}/quotations`);
    const qSnap = await getDocs(quotationsRef);
    const allQuotes = qSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

    // 2. Filter active, unexpired quotations
    const todayStr = new Date().toISOString().split('T')[0];
    const activeQuotes = allQuotes.filter(q => {
      const isActive = ['pending_client_approval', 'client_accepted', 'pending_seller_approval'].includes(q.status);
      const isExpired = q.expiryDate && q.expiryDate < todayStr;
      return isActive && !isExpired;
    });

    // 3. Compute reservations map: productId -> totalReservedQty
    const reservations: Record<string, number> = {};
    for (const q of activeQuotes) {
      if (q.items && Array.isArray(q.items)) {
        for (const item of q.items) {
          if (item.productId && typeof item.quantity === 'number') {
            reservations[item.productId] = (reservations[item.productId] || 0) + item.quantity;
          }
        }
      }
    }

    // 4. Fetch all products of the business and update reservedStock
    const productsRef = collection(db, `businesses/${businessId}/products`);
    const pSnap = await getDocs(productsRef);
    
    for (const pDoc of pSnap.docs) {
      const pId = pDoc.id;
      if (productIdsToSync && !productIdsToSync.includes(pId)) {
        continue;
      }
      const calculatedReserved = reservations[pId] || 0;
      const currentReserved = pDoc.data().reservedStock || 0;
      
      if (calculatedReserved !== currentReserved) {
        await updateDoc(doc(db, `businesses/${businessId}/products`, pId), {
          reservedStock: calculatedReserved
        });
        if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          console.log(`[Stock Reservation] Synced reserved stock for product ${pId}: ${currentReserved} -> ${calculatedReserved}`);
        }
      }
    }
  } catch (error) {
    console.error("Error syncing reserved stock:", error);
  }
};
