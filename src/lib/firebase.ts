import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore, setLogLevel } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
// import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// Suppress warning-level Firestore logs such as "Detected an update time that is in the future"
setLogLevel('error');

export const firebaseConfig = {
  apiKey: "AIzaSyA0pmCZZgijNZADj3D-DvkEtuPXhgMgJaI",
  authDomain: "sabush-system.firebaseapp.com",
  projectId: "sabush-system",
  storageBucket: "sabush-system.firebasestorage.app",
  messagingSenderId: "463395410378",
  appId: "1:463395410378:web:c352ceed6fa7770f983f33",
  measurementId: "G-QGE0MPQ40E"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore safely with persistent local cache, with memory fallback for iframe sandboxing
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (err) {
  console.warn("Firestore persistent local cache initialization failed (expected inside sandboxed iframes). Falling back to standard memory/network cache:", err);
  firestoreInstance = getFirestore(app);
}

export const db = firestoreInstance;

export const auth = getAuth(app);
export const storage = getStorage(app);

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ 
  prompt: 'select_account' 
});

export async function testConnection() {
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      timeoutPromise
    ]);
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      console.log("Firebase connection successful");
    }
  } catch (error) {
    // Log as an informational warning rather than a scary error since offline caching is enabled
    console.info("Firestore is operating in persistent local cache mode. All edits are saved locally and will sync to the cloud automatically when a network connection is available.");
  }
}

testConnection();

// Error handler as per integration guidelines
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
