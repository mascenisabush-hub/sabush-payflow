import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type AuditEventType = 
  | 'price_override' 
  | 'discount_applied' 
  | 'item_voided' 
  | 'manager_override_used' 
  | 'refund_processed'
  | 'price_adjustment_processed';

export interface AuditLogParams {
  businessId: string;
  eventType: AuditEventType;
  performedBy: {
    uid: string;
    name: string;
    email: string;
  };
  approvedBy?: string; // e.g. "PIN: 1234" or Manager Name
  originalValue?: string | number | null;
  newValue?: string | number | null;
  reason?: string | null;
  relatedInvoiceId?: string | null;
  cartSessionId?: string | null;
  details?: any;
}

/**
 * Centered audit logging system for Sabush System ERP
 */
export async function logAuditEvent(params: AuditLogParams): Promise<string | null> {
  const { businessId, ...logData } = params;
  if (!businessId) {
    console.warn("[AUDIT LOG] Missing businessId, log not written:", params);
    return null;
  }

  try {
    const logsRef = collection(db, `businesses/${businessId}/auditLogs`);
    const docRef = await addDoc(logsRef, {
      ...logData,
      timestamp: serverTimestamp()
    });
    console.log(`[AUDIT LOG] Successfully written log event: ${params.eventType} (ID: ${docRef.id})`);
    return docRef.id;
  } catch (error) {
    console.error("[AUDIT LOG] Failed to write audit log to Firestore:", error);
    return null;
  }
}
