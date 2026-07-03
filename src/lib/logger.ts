import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export enum ActionType {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  CREATE_INVOICE = 'CREATE_INVOICE',
  UPDATE_INVOICE = 'UPDATE_INVOICE',
  DELETE_INVOICE = 'DELETE_INVOICE',
  CREATE_PRODUCT = 'CREATE_PRODUCT',
  UPDATE_PRODUCT = 'UPDATE_PRODUCT',
  DELETE_PRODUCT = 'DELETE_PRODUCT',
  UPDATE_STOCK = 'UPDATE_STOCK',
  CREATE_CUSTOMER = 'CREATE_CUSTOMER',
  UPDATE_CUSTOMER = 'UPDATE_CUSTOMER',
  DELETE_CUSTOMER = 'DELETE_CUSTOMER',
  CREATE_EXPENSE = 'CREATE_EXPENSE',
  DELETE_EXPENSE = 'DELETE_EXPENSE',
  CREATE_STAFF = 'CREATE_STAFF',
  UPDATE_SUBSCRIPTION = 'UPDATE_SUBSCRIPTION',
  ACCOUNT_STATUS_CHANGE = 'ACCOUNT_STATUS_CHANGE',
  TERMS_ACCEPTED = 'TERMS_ACCEPTED'
}

export async function logAction(uid: string, email: string, action: ActionType, details: string, businessId?: string) {
  try {
    const logData: any = {
      uid: uid || 'unknown',
      email: email || 'unknown',
      action,
      details: details || '',
      timestamp: serverTimestamp()
    };
    if (businessId) {
      logData.businessId = businessId;
    }
    await addDoc(collection(db, 'activity_logs'), logData);
  } catch (err) {
    console.error('Failed to log action:', err);
  }
}
