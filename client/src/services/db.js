/**
 * Client-side IndexedDB Storage Utility for User Device Local Storage
 * Stores file Blobs directly on the user's device. Zero server disk usage.
 */

const DB_NAME = 'TempVaultDeviceStorage';
const DB_VERSION = 1;
const STORE_NAME = 'local_files';

/**
 * Open or initialize IndexedDB instance
 */
export const openDB = () => {
  return new Promise((resolve, reject) => {
    console.log('[IndexedDB] Opening database:', DB_NAME, 'version:', DB_VERSION);
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      console.log('[IndexedDB] Database upgrade needed. Initializing object store:', STORE_NAME);
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'code' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      console.log('[IndexedDB] Database opened successfully.');
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB ERROR] Failed to open IndexedDB:', event.target.error);
      reject(event.target.error || 'Failed to open IndexedDB');
    };
  });
};

/**
 * Save a file Blob to IndexedDB
 * @param {string} code 
 * @param {Blob|File} blob 
 * @param {Object} metadata 
 */
export const saveLocalFile = async (code, blob, metadata = {}) => {
  console.log(`[IndexedDB] saveLocalFile initiating for code '${code}'...`, {
    blobSize: blob ? blob.size : 0,
    metadata,
  });

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const cleanCode = String(code).trim();
      const record = {
        code: cleanCode,
        blob,
        name: metadata.originalName || metadata.name || 'file',
        mimeType: metadata.mimeType || (blob ? blob.type : '') || 'application/octet-stream',
        size: metadata.size || (blob ? blob.size : 0),
        createdAt: metadata.createdAt || new Date().toISOString(),
        expiresAt: metadata.expiresAt || null,
      };

      const request = store.put(record);

      request.onsuccess = () => {
        console.log(`[IndexedDB SUCCESS] Saved file blob locally under code '${cleanCode}'. Record:`, {
          code: record.code,
          name: record.name,
          size: record.size,
        });
        resolve(record);
      };

      request.onerror = (event) => {
        console.error(`[IndexedDB ERROR] Failed to save file blob for code '${cleanCode}':`, event.target.error);
        reject(event.target.error || 'Failed to save file to device storage');
      };

      tx.oncomplete = () => {
        console.log(`[IndexedDB] Transaction completed for code '${cleanCode}'.`);
      };

      tx.onerror = (event) => {
        console.error(`[IndexedDB ERROR] Transaction error for code '${cleanCode}':`, event.target.error);
      };
    });
  } catch (err) {
    console.error(`[IndexedDB EXCEPTION] Exception in saveLocalFile for code '${code}':`, err);
    throw err;
  }
};

/**
 * Retrieve a stored file record by code from IndexedDB (case-insensitive)
 * @param {string} code 
 * @returns {Promise<Object|null>}
 */
export const getLocalFile = async (code) => {
  console.log(`[IndexedDB] getLocalFile lookup requested for code '${code}'...`);
  try {
    if (!code) {
      console.warn('[IndexedDB] getLocalFile: Code parameter is empty.');
      return null;
    }
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const records = request.result || [];
        const cleanCode = String(code).trim().toLowerCase();
        console.log(`[IndexedDB] Total local records in IndexedDB: ${records.length}. Searching for match with '${cleanCode}'...`);
        records.forEach(r => console.log(`  -> Stored record code: '${r.code}' (name: '${r.name}', size: ${r.size})`));

        const match = records.find((r) => String(r.code).trim().toLowerCase() === cleanCode);
        if (match) {
          console.log(`[IndexedDB MATCH FOUND] Found local file record for '${code}':`, {
            code: match.code,
            name: match.name,
            size: match.size,
            hasBlob: !!match.blob,
          });
        } else {
          console.warn(`[IndexedDB NO MATCH] No local record found in browser IndexedDB for code '${code}'.`);
        }
        resolve(match || null);
      };

      request.onerror = (event) => {
        console.error(`[IndexedDB ERROR] Error fetching records from store:`, event.target.error);
        resolve(null);
      };
    });
  } catch (err) {
    console.error('[IndexedDB EXCEPTION] Error reading local file:', err);
    return null;
  }
};

/**
 * Delete a local file from IndexedDB by code
 * @param {string} code 
 */
export const deleteLocalFile = async (code) => {
  console.log(`[IndexedDB] deleteLocalFile requested for code '${code}'...`);
  try {
    if (!code) return false;
    const db = await openDB();
    const targetCode = String(code).trim().toLowerCase();
    const records = await getAllLocalFiles();
    const match = records.find((r) => String(r.code).trim().toLowerCase() === targetCode);

    if (match) {
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(match.code);

        req.onsuccess = () => {
          console.log(`[IndexedDB SUCCESS] Deleted local record '${match.code}' from IndexedDB.`);
          resolve(true);
        };
        req.onerror = (event) => {
          console.error(`[IndexedDB ERROR] Failed to delete local record '${match.code}':`, event.target.error);
          resolve(false);
        };
      });
    } else {
      console.log(`[IndexedDB] deleteLocalFile: No matching record found to delete for code '${code}'.`);
      return true;
    }
  } catch (err) {
    console.error('[IndexedDB EXCEPTION] Error deleting local file:', err);
    return false;
  }
};

/**
 * List all active local file codes stored in browser IndexedDB
 */
export const getAllLocalFiles = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const result = request.result || [];
        console.log(`[IndexedDB] getAllLocalFiles returning ${result.length} file records.`);
        resolve(result);
      };
      request.onerror = (event) => {
        console.error('[IndexedDB ERROR] getAllLocalFiles failed:', event.target.error);
        reject(event.target.error || 'Failed to list local files');
      };
    });
  } catch (err) {
    console.error('[IndexedDB EXCEPTION] Error listing local files:', err);
    return [];
  }
};
