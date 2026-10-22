/**
 * Client-side IndexedDB Storage Utility for User Device Local Storage
 * Stores file Blobs directly on the user's device. Zero server disk usage.
 * Supports torrent piece slicing on demand.
 */

const DB_NAME = 'TShareDeviceStorage';
const DB_VERSION = 2; // Incremented for torrent piece metadata support
const STORE_NAME = 'local_files';

// Bounded in-memory LRU cache to prevent browser Out-Of-Memory (OOM) tab crashes
const MAX_CACHED_BLOBS = 3;
const MAX_TOTAL_CACHE_BYTES = 50 * 1024 * 1024; // 50 MB threshold for in-memory caching
const activeBlobCache = new Map();

const pruneBlobCache = () => {
  let totalBytes = 0;
  for (const entry of activeBlobCache.values()) {
    totalBytes += entry.size || 0;
  }

  while (activeBlobCache.size > MAX_CACHED_BLOBS || totalBytes > MAX_TOTAL_CACHE_BYTES) {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, entry] of activeBlobCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const removed = activeBlobCache.get(oldestKey);
      totalBytes -= removed?.size || 0;
      activeBlobCache.delete(oldestKey);
    } else {
      break;
    }
  }
};

const setCacheEntry = (code, entry) => {
  if ((entry.size || 0) < MAX_TOTAL_CACHE_BYTES) {
    activeBlobCache.set(code, entry);
    pruneBlobCache();
  }
};

/**
 * Open or initialize IndexedDB instance
 */
export const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'code' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
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
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const cleanCode = String(code).trim().toUpperCase();
      const record = {
        code: cleanCode,
        blob,
        name: metadata.originalName || metadata.name || 'file',
        mimeType: metadata.mimeType || (blob ? blob.type : '') || 'application/octet-stream',
        size: metadata.size || (blob ? blob.size : 0),
        pieceSize: metadata.pieceSize || 512 * 1024,
        totalPieces: metadata.totalPieces || Math.ceil((blob ? blob.size : 0) / (512 * 1024)),
        createdAt: metadata.createdAt || new Date().toISOString(),
        expiresAt: metadata.expiresAt || null,
      };

      const request = store.put(record);

      request.onsuccess = () => {
        setCacheEntry(cleanCode, {
          blob,
          size: record.size,
          pieceSize: record.pieceSize,
          totalPieces: record.totalPieces,
          lastAccessed: Date.now(),
        });
        resolve(record);
      };

      request.onerror = (event) => {
        console.error(`[IndexedDB ERROR] Failed to save file blob for code '${cleanCode}':`, event.target.error);
        reject(event.target.error || 'Failed to save file to device storage');
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
  try {
    if (!code) return null;
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const cleanCode = String(code).trim().toUpperCase();

      const directReq = store.get(cleanCode);
      directReq.onsuccess = () => {
        if (directReq.result) {
          resolve(directReq.result);
        } else {
          // Fallback scan if case differed
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            const records = allReq.result || [];
            const match = records.find((r) => String(r.code).trim().toUpperCase() === cleanCode);
            resolve(match || null);
          };
          allReq.onerror = () => resolve(null);
        }
      };
      directReq.onerror = () => resolve(null);
    });
  } catch (err) {
    console.error('[IndexedDB EXCEPTION] Error reading local file:', err);
    return null;
  }
};

/**
 * Slice raw binary ArrayBuffer for WebRTC DataChannel (0 base64 overhead)
 * @param {string} code 
 * @param {number} pieceIndex 
 * @param {number} pieceSize 
 */
export const getRawPieceSlice = async (code, pieceIndex, pieceSize = 512 * 1024) => {
  const cleanCode = String(code || '').trim().toUpperCase();
  let blob = null;
  let blobSize = 0;

  if (activeBlobCache.has(cleanCode)) {
    const cached = activeBlobCache.get(cleanCode);
    cached.lastAccessed = Date.now();
    blob = cached.blob;
    blobSize = cached.size || (blob ? blob.size : 0);
  }

  if (!blob) {
    const fileRecord = await getLocalFile(cleanCode);
    if (!fileRecord || !fileRecord.blob) {
      throw new Error(`File '${cleanCode}' not found or blob missing in local storage.`);
    }
    blob = fileRecord.blob;
    blobSize = fileRecord.size || blob.size;
    setCacheEntry(cleanCode, {
      blob,
      size: blobSize,
      pieceSize: fileRecord.pieceSize || pieceSize,
      totalPieces: fileRecord.totalPieces,
      lastAccessed: Date.now(),
    });
  }

  const start = pieceIndex * pieceSize;
  const end = Math.min(start + pieceSize, blobSize);

  if (start >= blobSize) {
    throw new Error(`Piece index ${pieceIndex} out of bounds for file size ${blobSize}.`);
  }

  const slice = blob.slice(start, end);
  const isLastPiece = end >= blobSize;
  const arrayBuffer = await slice.arrayBuffer();

  return {
    pieceIndex,
    arrayBuffer,
    byteLength: slice.size,
    isLastPiece,
  };
};

/**
 * Slice a specific torrent piece from a locally stored Blob and return as Base64 (Relay fallback)
 * @param {string} code 
 * @param {number} pieceIndex 
 * @param {number} pieceSize 
 */
export const getPieceSlice = async (code, pieceIndex, pieceSize = 512 * 1024) => {
  const cleanCode = String(code || '').trim().toUpperCase();
  let blob = null;
  let blobSize = 0;

  // 1. Check memory cache first to eliminate repeated IndexedDB lookups
  if (activeBlobCache.has(cleanCode)) {
    const cached = activeBlobCache.get(cleanCode);
    cached.lastAccessed = Date.now();
    blob = cached.blob;
    blobSize = cached.size || (blob ? blob.size : 0);
  }

  // 2. Fallback to IndexedDB if not currently in memory
  if (!blob) {
    const fileRecord = await getLocalFile(cleanCode);
    if (!fileRecord || !fileRecord.blob) {
      throw new Error(`File '${cleanCode}' not found or blob missing in local storage.`);
    }
    blob = fileRecord.blob;
    blobSize = fileRecord.size || blob.size;
    setCacheEntry(cleanCode, {
      blob,
      size: blobSize,
      pieceSize: fileRecord.pieceSize || pieceSize,
      totalPieces: fileRecord.totalPieces,
      lastAccessed: Date.now(),
    });
  }

  const start = pieceIndex * pieceSize;
  const end = Math.min(start + pieceSize, blobSize);

  if (start >= blobSize) {
    throw new Error(`Piece index ${pieceIndex} out of bounds for file size ${blobSize}.`);
  }

  const slice = blob.slice(start, end);
  const isLastPiece = end >= blobSize;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result || '';
      const commaIdx = resultStr.indexOf(',');
      const pieceBase64 = commaIdx >= 0 ? resultStr.substring(commaIdx + 1) : resultStr;
      resolve({
        pieceIndex,
        pieceBase64,
        byteLength: slice.size,
        isLastPiece,
      });
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(slice);
  });
};

/**
 * Delete a local file from IndexedDB by code
 * @param {string} code 
 */
export const deleteLocalFile = async (code) => {
  try {
    if (!code) return false;
    const db = await openDB();
    const targetCode = String(code).trim().toUpperCase();

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(targetCode);

      req.onsuccess = () => {
        activeBlobCache.delete(targetCode);
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
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
        resolve(request.result || []);
      };
      request.onerror = (event) => {
        reject(event.target.error || 'Failed to list local files');
      };
    });
  } catch (err) {
    console.error('[IndexedDB EXCEPTION] Error listing local files:', err);
    return [];
  }
};
