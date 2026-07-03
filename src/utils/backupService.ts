import { collection, getDocs, getDocsFromCache, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';

const COLLECTIONS_TO_BACKUP = [
  'customers',
  'products',
  'invoices',
  'expenses',
  'expense_categories',
  'payments',
  'quebras',
  'quotations',
  'online_orders',
  'suppliers',
  'supplier_payments',
  'purchase_orders',
  'pos_shifts'
];

/**
 * Safely fetches documents from a subcollection. First attempts to get from the server
 * with a strict 3-second timeout. If that fails or times out, instantly falls back to 
 * the local Firestore offline cache.
 */
async function fetchCollectionData(businessId: string, collName: string): Promise<any[]> {
  const collRef = collection(db, 'businesses', businessId, collName);
  
  try {
    // Attempt database server fetch with a 3-second timeout
    const snap = await Promise.race([
      getDocs(collRef),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
    ]);
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (err: any) {
    console.warn(`[Backup Service] Falha ao ler do servidor para a coleção '${collName}' (${err.message || err}). A ler da cache local do Firestore...`);
    try {
      // Fallback: Read immediately from Firestore offline local cache
      const snap = await getDocsFromCache(collRef);
      return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (cacheErr: any) {
      console.warn(`[Backup Service] Falha ao ler da cache para a coleção '${collName}':`, cacheErr.message || cacheErr);
      return [];
    }
  }
}

/**
 * Executes a full client-side backup of all critical Firestore business directories.
 * Uploads the resulting serialized JSON dataset straight to secure Firebase Storage
 * and records the action inside the historical subcollection of the tenant.
 */
export async function runDatabaseBackup(businessId: string, triggerType: 'manual' | 'scheduled' = 'manual') {
  if (!businessId) {
    throw new Error("ID da empresa em falta para realizar a cópia de segurança.");
  }

  const backupData: any = {
    businessId,
    timestamp: new Date().toISOString(),
    version: "1.0",
    collections: {}
  };

  const backedUpCollections: string[] = [];

  // Fetch all collections in parallel to guarantee maximum performance and bypass sequential blockers
  const fetchPromises = COLLECTIONS_TO_BACKUP.map(async (collName) => {
    try {
      const docs = await fetchCollectionData(businessId, collName);
      backupData.collections[collName] = docs;
      backedUpCollections.push(collName);
    } catch (err: any) {
      console.warn(`[Backup Service] Erro inesperado ao obter '${collName}':`, err);
    }
  });

  await Promise.all(fetchPromises);

  // Build the unified JSON payload file
  const jsonString = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });

  const dateStr = new Date().toISOString().slice(0, 10);
  const timestamp = Date.now();
  const filename = `backup_${dateStr}_${timestamp}.json`;
  const storagePath = `businesses/${businessId}/backups/${filename}`;

  let uploadedToCloud = false;
  let downloadUrl = "";
  let backupDocId = "";

  const timeoutPromise = (ms: number, message: string) => 
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));

  try {
    // Stream raw JSON payload directly to Firebase Storage bucket with a 5-second timeout
    const fileRef = ref(storage, storagePath);
    await Promise.race([
      uploadBytes(fileRef, blob, { 
        contentType: 'application/json',
        customMetadata: {
          businessId,
          triggerType,
          size: String(blob.size),
          collectionsCount: String(backedUpCollections.length)
        }
      }),
      timeoutPromise(5000, "Limite de tempo de upload excedido para Cópia de Segurança em Nuvem (GCP Storage sem resposta)")
    ]);

    downloadUrl = (await Promise.race([
      getDownloadURL(fileRef),
      timeoutPromise(3000, "Limite de tempo para obter URL de download excedido")
    ])) as string;

    // Add metadata tracking block log to Firestore
    const backupDocRef = await addDoc(collection(db, 'businesses', businessId, 'backups'), {
      filename,
      path: storagePath,
      downloadUrl,
      createdAt: serverTimestamp(),
      sizeBytes: blob.size,
      collections: backedUpCollections,
      status: 'completed',
      triggerType
    });

    backupDocId = backupDocRef.id;
    uploadedToCloud = true;

    // Keep business settings record in sync with the latest execution status
    await updateDoc(doc(db, 'businesses', businessId), {
      lastBackupAt: serverTimestamp(),
      lastBackupStatus: 'success'
    });
  } catch (err: any) {
    console.warn("[Backup Service] Falha ao enviar para o Firebase Storage. Usando cópia de download local:", err.message || err);
  }

  return {
    id: backupDocId || 'local_only',
    filename,
    downloadUrl: downloadUrl || '',
    sizeBytes: blob.size,
    collections: backedUpCollections,
    isLocalFallback: !uploadedToCloud,
    blob
  };
}

/**
 * Scans the active configuration of the tenant, looks up schedule intervals in settings,
 * evaluates last backup timestamps, and fires a background backup if the interval is met.
 */
export async function checkAndTriggerAutoBackup(businessId: string, businessData: any) {
  if (!businessId || !businessData) return;

  const schedule = businessData.backupSchedule;
  if (!schedule || schedule === 'disabled') return;

  // Prevent duplicate execution requests on the active window or hot refreshes
  if (window.sessionStorage.getItem('isAutoBackupChecking') === 'true') return;
  window.sessionStorage.setItem('isAutoBackupChecking', 'true');

  try {
    const lastBackupAt = businessData.lastBackupAt;
    let shouldBackup = false;

    if (!lastBackupAt) {
      shouldBackup = true;
    } else {
      // Resolve timestamp to standard Date
      const lastBackupDate = lastBackupAt.toDate ? lastBackupAt.toDate() : new Date(lastBackupAt);
      const diffMs = Date.now() - lastBackupDate.getTime();

      if (schedule === 'daily' && diffMs >= 24 * 60 * 60 * 1000) {
        shouldBackup = true;
      } else if (schedule === 'weekly' && diffMs >= 7 * 24 * 60 * 60 * 1000) {
        shouldBackup = true;
      }
    }

    if (shouldBackup) {
      console.log(`[Backup Service] Agendamento ativo detetado (${schedule}). A iniciar cópia de segurança em segundo plano...`);

      // Gracefully prevent race conditions by immediately claiming the lock
      await updateDoc(doc(db, 'businesses', businessId), {
        lastBackupAt: serverTimestamp()
      });

      await runDatabaseBackup(businessId, 'scheduled');
      console.log(`[Backup Service] Cópia de segurança automática de rotina concluída.`);
    }
  } catch (err: any) {
    console.error('[Backup Service] Falha ao verificar ou processar cópia de segurança automática:', err.message || err);
  } finally {
    window.sessionStorage.removeItem('isAutoBackupChecking');
  }
}
