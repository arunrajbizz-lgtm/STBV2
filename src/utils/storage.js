/**
 * Utility for Typed LocalStorage and IndexedDB handling
 */

const DB_NAME = "PoomaniDB";
const DB_VERSION = 2;
const STORE_NAME = "providers";

export const storage = {
  get: (key, defaultValue = null) => {
    try {
      const value = localStorage.getItem(key);
      if (value === null) return defaultValue;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (err) {
      console.error(err);
      return defaultValue;
    }
  },
  
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`Error saving key ${key} to storage`, e);
      return false;
    }
  },
  
  remove: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error(`Error removing key ${key} from storage`, e);
      return false;
    }
  },

  /**
   * IndexedDB - Providers Store
   */
  initDB: () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  saveProviderDB: async (provider) => {
    console.log("Provider object created:", provider);
    try {
      const db = await storage.initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(provider);
        
        request.onsuccess = () => {
          console.log("IndexedDB save success");
          resolve(true);
        };
        request.onerror = () => {
          console.error("IndexedDB write failed:", request.error);
          reject(request.error);
        };
      });
    } catch (e) {
      console.error("IndexedDB init failed:", e);
      throw e;
    }
  },

  getAllProvidersDB: async () => {
    const db = await storage.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  deleteProviderDB: async (id) => {
    const db = await storage.initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
};
