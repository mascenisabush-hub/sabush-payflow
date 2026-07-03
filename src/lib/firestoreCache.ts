import { collection, query, onSnapshot, Query } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import { useState, useEffect } from 'react';

// Clear cached listener subscriptions on authenticated paths immediately upon logout
onAuthStateChanged(auth, (user) => {
  if (!user) {
    listenerCache.forEach((entry, path) => {
      const isPublicPath = path.includes('demo_business_123') || path.startsWith('platform') || path === 'test/connection';
      if (!isPublicPath) {
        if (entry.cleanupTimeout) {
          clearTimeout(entry.cleanupTimeout);
        }
        if (entry.unsubFirestore) {
          try {
            entry.unsubFirestore();
          } catch (e) {
            console.warn(`[Firestore Cache] Error cleaning up path ${path} on logout:`, e);
          }
          entry.unsubFirestore = null;
        }
        listenerCache.delete(path);
      }
    });
  }
});

type CacheEntry = {
  data: any[];
  subscribers: Set<(data: any[]) => void>;
  unsubFirestore: (() => void) | null;
  loading: boolean;
  error: any;
  cleanupTimeout: any;
};

const listenerCache = new Map<string, CacheEntry>();

export function getSharedCollectionCached(path: string): any[] | null {
  const entry = listenerCache.get(path);
  return entry && !entry.loading ? entry.data : null;
}

export function subscribeToCollection(
  path: string,
  callback: (data: any[]) => void,
  customQuery?: Query,
  onError?: (err: any) => void
): () => void {
  let entry = listenerCache.get(path);

  if (!entry) {
    entry = {
      data: [],
      subscribers: new Set(),
      unsubFirestore: null,
      loading: true,
      error: null,
      cleanupTimeout: null,
    };
    listenerCache.set(path, entry);
  }

  // Clear any pending teardown since we have a subscriber
  if (entry.cleanupTimeout) {
    clearTimeout(entry.cleanupTimeout);
    entry.cleanupTimeout = null;
  }

  entry.subscribers.add(callback);

  // If already loaded, trigger callback immediately
  if (!entry.loading) {
    callback(entry.data);
  }

  // Initialize the Firestore listener if not already active
  if (!entry.unsubFirestore) {
    const isPublicPath = path.includes('demo_business_123') || path.startsWith('platform') || path === 'test/connection';
    
    if (!auth.currentUser && !isPublicPath) {
      console.warn(`[Firestore Cache] Skipping subscription to path ${path} because user is not authenticated.`);
      entry.loading = false;
      entry.data = [];
      callback([]);
      return () => {};
    }

    const q = customQuery || query(collection(db, path));
    
    try {
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const docs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          
          if (entry) {
            entry.data = docs;
            entry.loading = false;
            entry.error = null;
            
            // Notify all subscribers
            entry.subscribers.forEach((sub) => {
              try {
                sub(docs);
              } catch (e) {
                console.error(`Error notifying subscriber for path ${path}:`, e);
              }
            });
          }
        },
        (error) => {
          console.warn(`[Firestore Cache] Error listening to path ${path}:`, error);
          if (entry) {
            entry.error = error;
            entry.loading = false;
          }
          if (onError) {
            onError(error);
          }
        }
      );
      entry.unsubFirestore = unsub;
    } catch (err) {
      console.error(`[Firestore Cache] Initialization failed for ${path}:`, err);
      entry.loading = false;
      if (onError) onError(err);
    }
  }

  // Return the unsubscribe function for the subscriber
  return () => {
    if (!entry) return;
    entry.subscribers.delete(callback);

    // If no more subscribers, clean up the Firestore listener after a delay
    // This allows navigating between tabs or quick state changes without triggering resubscribe reads
    if (entry.subscribers.size === 0) {
      if (entry.cleanupTimeout) {
        clearTimeout(entry.cleanupTimeout);
      }
      entry.cleanupTimeout = setTimeout(() => {
        if (entry && entry.subscribers.size === 0) {
          if (entry.unsubFirestore) {
            entry.unsubFirestore();
            entry.unsubFirestore = null;
          }
          entry.loading = true; // reset so next mount fetches fresh
          listenerCache.delete(path);
          // console.log(`[Firestore Cache] Unsubscribed from path: ${path} (inactive)`);
        }
      }, 30000); // 30 seconds cooling period
    }
  };
}

export function useSharedCollection<T = any>(
  path: string | null | undefined,
  customQuery?: Query,
  deps: any[] = []
): { data: T[]; loading: boolean; error: any } {
  const [data, setData] = useState<T[]>(() => {
    if (!path) return [];
    const cached = listenerCache.get(path);
    return cached ? (cached.data as T[]) : [];
  });
  
  const [loading, setLoading] = useState<boolean>(() => {
    if (!path) return false;
    const cached = listenerCache.get(path);
    return cached ? cached.loading : true;
  });
  
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    if (!path) {
      setData([]);
      setLoading(false);
      return;
    }

    const cached = listenerCache.get(path);
    if (cached) {
      setData(cached.data as T[]);
      setLoading(cached.loading);
    } else {
      setLoading(true);
    }

    const unsub = subscribeToCollection(
      path,
      (updatedDocs) => {
        setData(updatedDocs as T[]);
        setLoading(false);
      },
      customQuery,
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsub();
    };
  }, [path, ...deps]);

  return { data, loading, error };
}
