import { getAllLocalFiles, getPieceSlice, getRawPieceSlice, saveLocalFile } from './db';
import {
  sendSwarmHeartbeat,
  fetchPendingPieces,
  servePiece,
  requestPiece,
  fetchSwarmStatus,
  sendSwarmSignal,
  fetchSwarmSignals,
  notifyDownloadComplete,
} from './api';

// Generate or retrieve persistent browser client identifier
const getClientId = () => {
  let id = sessionStorage.getItem('tshare_client_id') || sessionStorage.getItem('tempvault_client_id');
  if (!id) {
    id = 'peer_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    sessionStorage.setItem('tshare_client_id', id);
  }
  return id;
};

// Standard public STUN servers for WebRTC peer discovery (0 server data relaying)
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

// ============================================================================
// UPLOAD PERMISSION CONTROL (Allow or Stop Uploading / Seeding per File)
// ============================================================================

const STOPPED_UPLOADS_KEY = 'tshare_stopped_uploads';

/**
 * Retrieve Set of file codes where upload/seeding has been stopped by the user
 * @returns {Set<string>}
 */
export const getStoppedUploads = () => {
  try {
    const raw = localStorage.getItem(STOPPED_UPLOADS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map((c) => String(c).toUpperCase()) : []);
  } catch (_) {
    return new Set();
  }
};

/**
 * Check if upload/seeding is allowed for a file code (Default: TRUE)
 * @param {string} code 
 * @returns {boolean}
 */
export const isUploadAllowed = (code) => {
  if (!code) return true;
  const stopped = getStoppedUploads();
  return !stopped.has(String(code).toUpperCase());
};

/**
 * Allow or stop upload/seeding for a specific file code
 * @param {string} code 
 * @param {boolean} allowed 
 */
export const setUploadAllowed = (code, allowed) => {
  if (!code) return;
  const cleanCode = String(code).toUpperCase();
  const stopped = getStoppedUploads();
  if (allowed) {
    stopped.delete(cleanCode);
  } else {
    stopped.add(cleanCode);
    // Close any active peer connections currently serving chunks for this code
    for (const [peerId, pc] of activeSeederPeerConnections.entries()) {
      try {
        pc.close();
      } catch (_) {}
    }
    activeSeederPeerConnections.clear();
  }
  try {
    localStorage.setItem(STOPPED_UPLOADS_KEY, JSON.stringify(Array.from(stopped)));
  } catch (_) {}

  // Trigger heartbeat immediately to announce or un-announce
  processSeederTasks().catch(() => {});
};

// ============================================================================
// SEEDER SERVICE (Runs in background for files stored in browser IndexedDB)
// ============================================================================

let seederInterval = null;
let isServingPieces = false;
// Active WebRTC connections managed by this seeder: Map<peerId, RTCPeerConnection>
const activeSeederPeerConnections = new Map();

/**
 * Handle incoming WebRTC DataChannel connection from a downloader
 */
const setupSeederDataChannel = (channel, code) => {
  channel.binaryType = 'arraybuffer';

  channel.onmessage = async (event) => {
    try {
      // Check if user has explicitly stopped upload for this file
      if (!isUploadAllowed(code)) {
        console.log(`[WebRTC Seeder] Upload request rejected for ${code} (upload stopped by user)`);
        return;
      }

      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.type === 'request_piece') {
          const pieceIndex = msg.pieceIndex;
          const pieceSize = msg.pieceSize || (512 * 1024);

          // Read raw chunk directly from local device IndexedDB without server RAM
          const raw = await getRawPieceSlice(code, pieceIndex, pieceSize);

          // Prepend 4-byte uint32 header for pieceIndex
          const packet = new Uint8Array(4 + raw.arrayBuffer.byteLength);
          new DataView(packet.buffer).setUint32(0, pieceIndex, true);
          packet.set(new Uint8Array(raw.arrayBuffer), 4);

          // Send raw binary directly browser-to-browser over WebRTC DataChannel!
          channel.send(packet.buffer);
        }
      }
    } catch (err) {
      console.warn(`[WebRTC Seeder] Error serving piece over DataChannel:`, err);
    }
  };
};

/**
 * Handle incoming WebRTC signaling messages received during seeder heartbeat
 */
const handleIncomingSeederSignals = async (signals, localFiles) => {
  if (!Array.isArray(signals) || signals.length === 0) return;

  const clientId = getClientId();
  const heldCodes = new Set(localFiles.map((f) => f.code));

  for (const item of signals) {
    const { fromClientId, code, signal } = item;
    if (!heldCodes.has(code) || !signal) continue;

    // Reject signals if upload is stopped for this file
    if (!isUploadAllowed(code)) continue;

    try {
      if (signal.type === 'offer') {
        // Create new WebRTC connection to answer downloader's offer
        let pc = activeSeederPeerConnections.get(fromClientId);
        if (pc) {
          pc.close();
        }

        pc = new RTCPeerConnection(RTC_CONFIG);
        activeSeederPeerConnections.set(fromClientId, pc);

        pc.ondatachannel = (event) => {
          setupSeederDataChannel(event.channel, code);
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            sendSwarmSignal(code, {
              fromClientId: clientId,
              toClientId: fromClientId,
              signal: { type: 'candidate', candidate: event.candidate },
            }).catch(() => {});
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await sendSwarmSignal(code, {
          fromClientId: clientId,
          toClientId: fromClientId,
          signal: { type: 'answer', sdp: answer },
        });
      } else if (signal.type === 'candidate') {
        const pc = activeSeederPeerConnections.get(fromClientId);
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      }
    } catch (err) {
      console.warn(`[WebRTC Seeder] Error handling signal from ${fromClientId}:`, err);
    }
  }
};

/**
 * Check for pending piece requests from downloaders and serve them from IndexedDB
 */
const processSeederTasks = async () => {
  if (isServingPieces) return;
  isServingPieces = true;

  try {
    const localFiles = await getAllLocalFiles();
    if (!localFiles || localFiles.length === 0) {
      isServingPieces = false;
      return;
    }

    const clientId = getClientId();
    // Filter local files to only those where upload is enabled (Default: true)
    const seedableFiles = localFiles.filter((f) => isUploadAllowed(f.code));
    const codes = seedableFiles.map((f) => f.code);

    // 1. Announce seeding presence and receive pending WebRTC signals + piece alerts
    let pendingCodes = [];
    let incomingSignals = [];
    try {
      const hbRes = await sendSwarmHeartbeat(clientId, codes);
      if (hbRes) {
        if (Array.isArray(hbRes.pendingCodes)) pendingCodes = hbRes.pendingCodes;
        if (Array.isArray(hbRes.signals)) incomingSignals = hbRes.signals;
      }
    } catch (err) {
      // Coordinator reconnecting
    }

    // 2. Process incoming WebRTC signaling (Direct Peer-to-Peer setup)
    if (incomingSignals.length > 0) {
      await handleIncomingSeederSignals(incomingSignals, localFiles);
    }

    // 3. Fallback: Serve pending HTTP requests if WebRTC is not active
    if (pendingCodes.length === 0) {
      isServingPieces = false;
      return;
    }

    const filesToServe = seedableFiles.filter((f) => pendingCodes.includes(f.code));

    for (const file of filesToServe) {
      const code = file.code;
      try {
        const res = await fetchPendingPieces(code);
        if (res.success && Array.isArray(res.pendingRequests) && res.pendingRequests.length > 0) {
          for (const req of res.pendingRequests) {
            const { requestId, pieceIndex } = req;
            try {
              const sliceInfo = await getPieceSlice(code, pieceIndex, file.pieceSize || 512 * 1024);
              await servePiece(code, {
                requestId,
                pieceIndex,
                pieceBase64: sliceInfo.pieceBase64,
                isLastPiece: sliceInfo.isLastPiece,
              });
            } catch (sliceErr) {
              console.warn(`[TorrentSeeder] Could not serve piece ${pieceIndex} for ${code}:`, sliceErr.message);
            }
          }
        }
      } catch (checkErr) {
        // Continue to next file
      }
    }
  } catch (globalErr) {
    console.warn('[TorrentSeeder] Seeder heartbeat error:', globalErr);
  } finally {
    isServingPieces = false;
  }
};

/**
 * Start background torrent seeder service with adaptive visibility throttling
 */
export const startTorrentSeederService = () => {
  if (seederInterval) return;

  const getIntervalMs = () => {
    if (typeof document !== 'undefined' && document.hidden) {
      return 15000; // 15s in hidden background tabs
    }
    return 5000; // 5s in active foreground tabs
  };

  const scheduleNext = () => {
    if (seederInterval) clearTimeout(seederInterval);
    seederInterval = setTimeout(async () => {
      await processSeederTasks();
      scheduleNext();
    }, getIntervalMs());
  };

  processSeederTasks();
  scheduleNext();

  if (typeof document !== 'undefined' && !window._tvVisibilityBound) {
    window._tvVisibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        processSeederTasks();
      }
      scheduleNext();
    });
  }
};

/**
 * Stop background torrent seeder service
 */
export const stopTorrentSeederService = () => {
  if (seederInterval) {
    clearTimeout(seederInterval);
    seederInterval = null;
  }
  for (const pc of activeSeederPeerConnections.values()) {
    pc.close();
  }
  activeSeederPeerConnections.clear();
};

// ============================================================================
// DOWNLOADER ENGINE (WebRTC Direct P2P Primary + HTTP Relay Fallback)
// ============================================================================

/**
 * Attempt to establish direct WebRTC DataChannel connection with a seeder
 */
const establishWebRTCChannel = async (cleanCode, targetSeederId, clientId, unlockToken = null) => {
  return new Promise((resolve) => {
    let settled = false;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const dc = pc.createDataChannel('tv_transfer', { ordered: true });
    dc.binaryType = 'arraybuffer';

    const cleanup = () => {
      if (pollTimer) clearInterval(pollTimer);
    };

    const failTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        pc.close();
        resolve(null);
      }
    }, 4500); // 4.5s WebRTC negotiation timeout before graceful HTTP fallback

    dc.onopen = () => {
      if (!settled) {
        settled = true;
        clearTimeout(failTimer);
        cleanup();
        resolve({ pc, dc });
      }
    };

    dc.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(failTimer);
        cleanup();
        pc.close();
        resolve(null);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSwarmSignal(cleanCode, {
          fromClientId: clientId,
          toClientId: targetSeederId,
          signal: { type: 'candidate', candidate: event.candidate },
        }, unlockToken).catch(() => {});
      }
    };

    let pollTimer = null;

    // Create and send offer with unlockToken if provided
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer).then(() => offer))
      .then((offer) => {
        return sendSwarmSignal(cleanCode, {
          fromClientId: clientId,
          toClientId: targetSeederId,
          signal: { type: 'offer', sdp: offer },
        }, unlockToken);
      })
      .then(() => {
        // Poll for answer signals from seeder
        pollTimer = setInterval(async () => {
          if (settled) return cleanup();
          try {
            const res = await fetchSwarmSignals(cleanCode, clientId);
            if (res.success && Array.isArray(res.signals)) {
              for (const sigItem of res.signals) {
                const s = sigItem.signal;
                if (s && s.type === 'answer' && !pc.currentRemoteDescription) {
                  await pc.setRemoteDescription(new RTCSessionDescription(s.sdp));
                } else if (s && s.type === 'candidate' && pc.currentRemoteDescription) {
                  await pc.addIceCandidate(new RTCIceCandidate(s.candidate)).catch(() => {});
                }
              }
            }
          } catch (_) {}
        }, 500);
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(failTimer);
          cleanup();
          pc.close();
          resolve(null);
        }
      });
  });
};

/**
 * Download a file from the swarm piece-by-piece, verify integrity,
 * assemble into a Blob, and auto-seed in browser IndexedDB.
 * 
 * Direct WebRTC DataChannel (zero-server RAM/disk) is attempted first;
 * automatically falls back to HTTP piece coordinator if WebRTC is blocked.
 * 
 * @param {string} code 
 * @param {Object} metadata 
 * @param {Object} options 
 * @param {string} [options.password]
 * @param {Function} [options.onProgress] ({ percent, piecesReceived, totalPieces, speedBytesPerSec, bitfield })
 * @param {AbortSignal} [options.signal]
 * @param {Function} [options.isPaused]
 * @returns {Promise<Blob>}
 */
export const downloadTorrentFile = async (code, metadata, options = {}) => {
  const { password = '', unlockToken = '', onProgress, signal, isPaused } = options;
  const cleanCode = String(code).trim().toUpperCase();

  const totalPieces = metadata.totalPieces || Math.ceil((metadata.size || 1) / (metadata.pieceSize || 512 * 1024));
  const pieces = new Array(totalPieces);
  const bitfield = new Array(totalPieces).fill(false);

  let piecesReceived = 0;
  let bytesReceived = 0;
  const startTime = Date.now();
  const clientId = getClientId();

  // 1. Query swarm status to locate online seeders for WebRTC matchmaking
  let targetSeederId = null;
  try {
    const swarmStatus = await fetchSwarmStatus(cleanCode);
    if (swarmStatus.success && Array.isArray(swarmStatus.seederIds) && swarmStatus.seederIds.length > 0) {
      targetSeederId = swarmStatus.seederIds[0];
    }
  } catch (_) {}

  // 2. Attempt direct WebRTC DataChannel connection (zero server RAM overhead)
  let webrtcSession = null;
  if (targetSeederId) {
    webrtcSession = await establishWebRTCChannel(cleanCode, targetSeederId, clientId, unlockToken);
  }

  const pieceQueue = Array.from({ length: totalPieces }, (_, i) => i);

  if (webrtcSession && webrtcSession.dc && webrtcSession.dc.readyState === 'open') {
    // =========================================================================
    // PATH A: DIRECT PEER-TO-PEER WEBRTC DATACHANNEL TRANSFER (0 Server RAM)
    // =========================================================================
    const { pc, dc } = webrtcSession;

    try {
      await new Promise((resolve, reject) => {
        let currentRequestResolver = null;
        let expectedPieceIndex = null;

        dc.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            const dataView = new DataView(event.data);
            const receivedIndex = dataView.getUint32(0, true);
            const chunkArrayBuffer = event.data.slice(4);

            if (currentRequestResolver && receivedIndex === expectedPieceIndex) {
              const resolveFn = currentRequestResolver;
              currentRequestResolver = null;
              resolveFn(chunkArrayBuffer);
            }
          }
        };

        dc.onerror = (err) => reject(err);
        dc.onclose = () => reject(new Error('WebRTC DataChannel closed prematurely'));

        const processQueueP2P = async () => {
          while (pieceQueue.length > 0) {
            if (signal?.aborted) throw new Error('Download aborted by user.');
            while (isPaused && isPaused()) {
              if (signal?.aborted) throw new Error('Download aborted by user.');
              await new Promise((r) => setTimeout(r, 400));
            }

            const pieceIndex = pieceQueue.shift();
            expectedPieceIndex = pieceIndex;

            const chunkArrayBuffer = await new Promise((resChunk, rejChunk) => {
              const timeout = setTimeout(() => {
                currentRequestResolver = null;
                rejChunk(new Error(`Timeout requesting piece ${pieceIndex} over WebRTC`));
              }, 6000);

              currentRequestResolver = (buf) => {
                clearTimeout(timeout);
                resChunk(buf);
              };

              dc.send(JSON.stringify({ type: 'request_piece', pieceIndex, pieceSize: metadata.pieceSize, unlockToken }));
            });

            pieces[pieceIndex] = chunkArrayBuffer;
            bitfield[pieceIndex] = true;
            piecesReceived += 1;
            bytesReceived += chunkArrayBuffer.byteLength;

            const elapsedSec = (Date.now() - startTime) / 1000;
            const speedBytesPerSec = elapsedSec > 0 ? Math.round(bytesReceived / elapsedSec) : 0;
            const percent = Math.min(100, Math.round((piecesReceived / totalPieces) * 100));

            if (onProgress) {
              onProgress({
                percent,
                piecesReceived,
                totalPieces,
                bytesReceived,
                totalBytes: metadata.size,
                speedBytesPerSec,
                bitfield: [...bitfield],
              });
            }
          }
          resolve();
        };

        processQueueP2P().catch(reject);
      });

      // Notify coordinator that transfer completed directly via WebRTC
      notifyDownloadComplete(cleanCode).catch(() => {});
    } catch (webrtcErr) {
      console.warn('[Downloader Engine] WebRTC transfer interrupted, falling back to coordinator:', webrtcErr.message);
      // Remaining queued pieces fall through to Path B
    } finally {
      if (dc) dc.close();
      if (pc) pc.close();
    }
  }

  // =========================================================================
  // PATH B: HTTP RELAY COORDINATOR (For remaining pieces or if WebRTC blocked)
  // =========================================================================
  if (pieceQueue.length > 0) {
    const CONCURRENCY = 2;

    const runWorker = async () => {
      while (pieceQueue.length > 0) {
        if (signal?.aborted) throw new Error('Download aborted by user.');
        while (isPaused && isPaused()) {
          if (signal?.aborted) throw new Error('Download aborted by user.');
          await new Promise((r) => setTimeout(r, 400));
        }

        const pieceIndex = pieceQueue.shift();
        let attempts = 0;
        const MAX_ATTEMPTS = 4;
        let success = false;

        while (attempts < MAX_ATTEMPTS && !success) {
          if (signal?.aborted) throw new Error('Download aborted by user.');
          while (isPaused && isPaused()) {
            if (signal?.aborted) throw new Error('Download aborted by user.');
            await new Promise((r) => setTimeout(r, 400));
          }
          try {
            const chunkArrayBuffer = await requestPiece(cleanCode, pieceIndex, password, clientId, unlockToken);
            pieces[pieceIndex] = chunkArrayBuffer;
            bitfield[pieceIndex] = true;
            piecesReceived += 1;
            bytesReceived += chunkArrayBuffer.byteLength;
            success = true;

            const elapsedSec = (Date.now() - startTime) / 1000;
            const speedBytesPerSec = elapsedSec > 0 ? Math.round(bytesReceived / elapsedSec) : 0;
            const percent = Math.min(100, Math.round((piecesReceived / totalPieces) * 100));

            if (onProgress) {
              onProgress({
                percent,
                piecesReceived,
                totalPieces,
                bytesReceived,
                totalBytes: metadata.size,
                speedBytesPerSec,
                bitfield: [...bitfield],
              });
            }
          } catch (err) {
            attempts += 1;
            if (attempts >= MAX_ATTEMPTS) {
              throw new Error(`Failed downloading piece ${pieceIndex} after ${MAX_ATTEMPTS} attempts: ${err.message || 'No response from seeders'}`);
            }
            await new Promise((r) => setTimeout(r, attempts * 1000));
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, pieceQueue.length) }, () => runWorker());
    await Promise.all(workers);
  }

  // =========================================================================
  // INTEGRITY VERIFICATION PHASE:
  // Ensure 100% of packets/pieces are acquired properly with no repeated,
  // missing, null, or corrupted parts, and exact byte length matching.
  // =========================================================================
  if (onProgress) {
    onProgress({
      percent: 100,
      piecesReceived,
      totalPieces,
      bytesReceived,
      totalBytes: metadata.size,
      speedBytesPerSec: 0,
      bitfield: [...bitfield],
      status: 'verifying',
      isVerifying: true,
    });
  }

  // Brief pause (350ms) to allow UI telemetry to transition to verifying state
  await new Promise((r) => setTimeout(r, 350));

  // 1. Bitfield completeness check: zero missing bits
  const missingPieceIndices = [];
  for (let i = 0; i < totalPieces; i++) {
    if (!bitfield[i]) missingPieceIndices.push(i);
  }
  if (missingPieceIndices.length > 0) {
    throw new Error(
      `Download verification failed: ${missingPieceIndices.length} missing packet(s) at indices [${missingPieceIndices.slice(0, 5).join(', ')}${missingPieceIndices.length > 5 ? '...' : ''}]`
    );
  }

  // 2. Strict Packet Validation: non-null, ArrayBuffer instance, non-empty, correct chunk sizes
  const standardPieceSize = metadata.pieceSize || 512 * 1024;
  const expectedTotalBytes = metadata.size || 0;
  let verifiedBytesTotal = 0;

  for (let i = 0; i < totalPieces; i++) {
    const chunk = pieces[i];
    if (!chunk || !(chunk instanceof ArrayBuffer) || chunk.byteLength === 0) {
      throw new Error(`Download verification failed: Packet #${i} is missing, null, or empty.`);
    }

    const isLastPiece = i === totalPieces - 1;
    const expectedPieceBytes = isLastPiece && expectedTotalBytes > 0
      ? (expectedTotalBytes - (totalPieces - 1) * standardPieceSize)
      : standardPieceSize;

    if (expectedTotalBytes > 0 && chunk.byteLength !== expectedPieceBytes) {
      throw new Error(
        `Download verification failed: Packet #${i} size mismatch. Expected ${expectedPieceBytes} bytes, received ${chunk.byteLength} bytes.`
      );
    }

    verifiedBytesTotal += chunk.byteLength;
  }

  // 3. Exact total size matching check
  if (expectedTotalBytes > 0 && verifiedBytesTotal !== expectedTotalBytes) {
    throw new Error(
      `Download verification failed: Total size mismatch. Expected ${expectedTotalBytes} bytes, verified ${verifiedBytesTotal} bytes.`
    );
  }

  console.log(
    `[TorrentEngine] ✅ Integrity verified for ${cleanCode}: all ${totalPieces} packets present and intact (${verifiedBytesTotal} bytes). Stopping download.`
  );

  // Assemble full Blob
  const assembledBlob = new Blob(pieces, { type: metadata.mimeType || 'application/octet-stream' });

  // 4. Cryptographic SHA-256 Checksum Verification (Defends against swarm piece poisoning / tampering)
  if (metadata.fileHash) {
    try {
      const assembledBuffer = await assembledBlob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', assembledBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const computedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      if (computedHash.toLowerCase() !== String(metadata.fileHash).toLowerCase()) {
        throw new Error(
          `Integrity verification failed: Cryptographic checksum mismatch. Expected SHA-256 (${metadata.fileHash.slice(0, 10)}...), received (${computedHash.slice(0, 10)}...). Chunks may have been corrupted or tampered with by an untrusted peer.`
        );
      }
      console.log(`[TorrentEngine] 🛡️ Cryptographic SHA-256 integrity verified for ${cleanCode}: ${computedHash}`);
    } catch (hashErr) {
      if (hashErr.message && hashErr.message.includes('Integrity verification failed')) {
        throw hashErr;
      }
      console.warn('[TorrentEngine] SHA-256 calculation note:', hashErr.message);
    }
  }

  // Immediately release chunk array references so garbage collection can reclaim memory
  for (let i = 0; i < pieces.length; i++) {
    pieces[i] = null;
  }

  // Automatically store in recipient's browser IndexedDB so recipient joins the swarm as a seeder
  try {
    await saveLocalFile(cleanCode, assembledBlob, {
      originalName: metadata.originalName,
      mimeType: metadata.mimeType,
      size: metadata.size,
      pieceSize: metadata.pieceSize,
      totalPieces: totalPieces,
      expiresAt: metadata.expiresAt,
    });
    // Trigger seeder heartbeat immediately if upload is allowed
    if (isUploadAllowed(cleanCode)) {
      startTorrentSeederService();
    }
  } catch (cacheErr) {
    console.warn('[TorrentDownloader] Could not auto-seed in IndexedDB:', cacheErr);
  }

  // Download officially finishes and stops
  return assembledBlob;
};
