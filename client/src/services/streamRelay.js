import { getAllLocalFiles } from './db';
import api from './api';

let relayInterval = null;
const CHUNK_SIZE = 256 * 1024; // 256 KB per chunk for fast, reliable peer stream transfer

/**
 * Read Blob as ArrayBuffer / Base64 chunk
 */
const readBlobSlice = (blob, start, end) => {
  return new Promise((resolve, reject) => {
    const slice = blob.slice(start, end);
    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result || '';
      const parts = resultStr.split(',');
      resolve(parts[1] || '');
    };
    reader.onerror = (err) => {
      console.error('[StreamRelay ERROR] FileReader error reading blob slice:', err);
      reject(err);
    };
    reader.readAsDataURL(slice);
  });
};

/**
 * Check server for pending stream requests for locally hosted files and relay chunks
 */
export const pollAndRelayStreams = async () => {
  try {
    const localFiles = await getAllLocalFiles();
    if (!localFiles || localFiles.length === 0) return;

    for (const fileRecord of localFiles) {
      const code = fileRecord.code;
      try {
        const checkRes = await api.get(`/stream-check/${code}`);
        if (checkRes.data && checkRes.data.pendingRequests && checkRes.data.pendingRequests.length > 0) {
          console.log(`[StreamRelay ALERT] Found ${checkRes.data.pendingRequests.length} pending download request(s) for local file '${code}'.`);
          const blob = fileRecord.blob;
          if (!blob) {
            console.error(`[StreamRelay ERROR] Local record '${code}' exists in IndexedDB but blob object is missing/null!`);
            continue;
          }

          for (const reqInfo of checkRes.data.pendingRequests) {
            const requestId = reqInfo.requestId;
            const totalBytes = blob.size;
            let offset = 0;

            console.log(`[StreamRelay STREAMING] Starting peer stream transfer for '${code}' (requestId: ${requestId}, size: ${totalBytes} bytes)...`);

            while (offset < totalBytes) {
              const chunkEnd = Math.min(offset + CHUNK_SIZE, totalBytes);
              const isLastChunk = chunkEnd >= totalBytes;
              const chunkBase64 = await readBlobSlice(blob, offset, chunkEnd);

              await api.post(`/stream-chunk/${code}`, {
                requestId,
                chunkBase64,
                isLastChunk,
              });

              console.log(`  -> Sent chunk for '${code}': ${offset} to ${chunkEnd} / ${totalBytes} bytes (${isLastChunk ? 'FINAL CHUNK' : 'in progress'})`);
              offset = chunkEnd;
            }

            console.log(`[StreamRelay SUCCESS] Completed peer stream transfer for '${code}' (requestId: ${requestId}).`);
          }
        }
      } catch (err) {
        console.error(`[StreamRelay ERROR] Error checking stream request for '${code}':`, err.message || err);
      }
    }
  } catch (err) {
    console.error('[StreamRelay EXCEPTION] Error polling stream requests:', err);
  }
};

/**
 * Start background polling service when user is on the site
 */
export const startStreamRelayService = () => {
  if (relayInterval) return;
  console.log('[StreamRelay] Starting background stream relay service (polling every 2s)...');
  pollAndRelayStreams();
  relayInterval = setInterval(pollAndRelayStreams, 2000);
};

/**
 * Stop stream relay service
 */
export const stopStreamRelayService = () => {
  if (relayInterval) {
    console.log('[StreamRelay] Stopping background stream relay service.');
    clearInterval(relayInterval);
    relayInterval = null;
  }
};
