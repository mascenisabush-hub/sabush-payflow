// Offline database utility using IndexedDB with fallback to localStorage
export const offlineDb = {
  dbName: "sabush_offline_cache",
  version: 2,

  getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error("IndexedDB is not supported on this platform"));
        return;
      }
      
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("products")) {
          db.createObjectStore("products", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("invoices")) {
          db.createObjectStore("invoices", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("pendingSales")) {
          db.createObjectStore("pendingSales", { keyPath: "id" });
        }
      };

      request.onsuccess = (event: any) => {
        resolve(event.target.result);
      };

      request.onerror = (event: any) => {
        reject(event.target.error || new Error("Failed to open IndexedDB"));
      };
    });
  },

  async saveProducts(products: any[]) {
    try {
      const db = await this.getDB();
      const tx = db.transaction("products", "readwrite");
      const store = tx.objectStore("products");
      
      // Clear old entries
      await new Promise<void>((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      // Store clean serializable objects
      for (const prod of products) {
        // Safe deep serialization to bypass circular or un-cloneable properties
        const cleanProd = JSON.parse(JSON.stringify(prod));
        store.put(cleanProd);
      }
    } catch (e) {
      console.warn("Error saving products to IndexedDB", e);
      try {
        localStorage.setItem("sabush_cached_products_fallback", JSON.stringify(products));
      } catch (locErr) {
        console.warn("Fallback localStorage failed too", locErr);
      }
    }
  },

  async getProducts(): Promise<any[]> {
    try {
      const db = await this.getDB();
      return new Promise<any[]>((resolve, reject) => {
        const tx = db.transaction("products", "readonly");
        const store = tx.objectStore("products");
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("Error reading products from IndexedDB, loading fallback", e);
      try {
        const fallback = localStorage.getItem("sabush_cached_products_fallback");
        return fallback ? JSON.parse(fallback) : [];
      } catch {
        return [];
      }
    }
  },

  async saveInvoices(invoices: any[]) {
    try {
      const db = await this.getDB();
      const tx = db.transaction("invoices", "readwrite");
      const store = tx.objectStore("invoices");

      // Clear old entries
      await new Promise<void>((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      // Store clean serializable objects
      for (const inv of invoices) {
        const cleanInv = JSON.parse(JSON.stringify(inv));
        store.put(cleanInv);
      }
    } catch (e) {
      console.warn("Error saving invoices to IndexedDB", e);
      try {
        localStorage.setItem("sabush_cached_invoices_fallback", JSON.stringify(invoices));
      } catch (locErr) {
        console.warn("Fallback localStorage failed too", locErr);
      }
    }
  },

  async getInvoices(): Promise<any[]> {
    try {
      const db = await this.getDB();
      return new Promise<any[]>((resolve, reject) => {
        const tx = db.transaction("invoices", "readonly");
        const store = tx.objectStore("invoices");
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("Error reading invoices from IndexedDB, loading fallback2", e);
      try {
        const fallback = localStorage.getItem("sabush_cached_invoices_fallback");
        return fallback ? JSON.parse(fallback) : [];
      } catch {
        return [];
      }
    }
  },

  async savePendingSale(sale: any) {
    try {
      const db = await this.getDB();
      const tx = db.transaction("pendingSales", "readwrite");
      const store = tx.objectStore("pendingSales");
      const cleanSale = JSON.parse(JSON.stringify(sale));
      await new Promise<void>((resolve, reject) => {
        const req = store.put(cleanSale);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("Error saving pending sale to IndexedDB, using fallback", e);
      try {
        const currentRaw = localStorage.getItem("sabush_pending_sales") || "[]";
        const current = JSON.parse(currentRaw);
        const index = current.findIndex((s: any) => s.id === sale.id);
        if (index !== -1) {
          current[index] = sale;
        } else {
          current.push(sale);
        }
        localStorage.setItem("sabush_pending_sales", JSON.stringify(current));
      } catch (locErr) {
        console.warn("Fallback localStorage failed for pending sale", locErr);
      }
    }
  },

  async getPendingSales(): Promise<any[]> {
    try {
      const db = await this.getDB();
      return new Promise<any[]>((resolve, reject) => {
        const tx = db.transaction("pendingSales", "readonly");
        const store = tx.objectStore("pendingSales");
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("Error reading pending sales from IndexedDB, loading fallback", e);
      try {
        const fallback = localStorage.getItem("sabush_pending_sales");
        return fallback ? JSON.parse(fallback) : [];
      } catch {
        return [];
      }
    }
  },

  async deletePendingSale(id: string) {
    try {
      const db = await this.getDB();
      const tx = db.transaction("pendingSales", "readwrite");
      const store = tx.objectStore("pendingSales");
      await new Promise<void>((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn("Error deleting pending sale from IndexedDB, using fallback", e);
      try {
        const currentRaw = localStorage.getItem("sabush_pending_sales") || "[]";
        let current = JSON.parse(currentRaw);
        current = current.filter((s: any) => s.id !== id);
        localStorage.setItem("sabush_pending_sales", JSON.stringify(current));
      } catch (locErr) {
        console.warn("Fallback localStorage delete failed", locErr);
      }
    }
  }
};

// Helper function to safely parse dates from various formats (e.g. Firestore Timestamp, JSON-serialized objects, strings, numbers, Dates)
export function parseSafeDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      return d && !isNaN(d.getTime()) ? d : null;
    } catch {
      // ignore
    }
  }
  if (typeof val === 'object') {
    // Check for JSON-serialized Firestore Timestamp format { seconds, nanoseconds } or { _seconds, _nanoseconds }
    const secs = val.seconds !== undefined ? val.seconds : (val._seconds !== undefined ? val._seconds : null);
    if (typeof secs === 'number') {
      const d = new Date(secs * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

