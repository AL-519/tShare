const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const File = require('../models/File');
const { generateUniqueCode } = require('../services/codeGenerator');

/**
 * Valid format for short codes (alphanumeric uppercase, 4 to 12 chars)
 */
const CODE_REGEX = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4,12}$/i;

/**
 * Helper to normalize and validate code input to prevent ReDoS / injection
 */
const sanitizeCode = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  return CODE_REGEX.test(trimmed) ? trimmed : null;
};

/**
 * Native HTTP cookie helpers with production security flags
 */
const setCookieHeader = (res, name, value, options = {}) => {
  const isProd = process.env.NODE_ENV === 'production';
  let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
  if (options.expires) {
    cookieStr += `; Expires=${options.expires.toUTCString()}`;
  }
  if (options.maxAge) {
    cookieStr += `; Max-Age=${Math.floor(options.maxAge / 1000)}`;
  }
  if (options.httpOnly !== false) {
    cookieStr += `; HttpOnly`;
  }
  if (isProd) {
    cookieStr += `; Secure`;
  }
  const prev = res.getHeader('Set-Cookie');
  if (!prev) {
    res.setHeader('Set-Cookie', cookieStr);
  } else if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', [...prev, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [prev, cookieStr]);
  }
};

const clearCookieHeader = (res, name) => {
  const isProd = process.env.NODE_ENV === 'production';
  let cookieStr = `${encodeURIComponent(name)}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax`;
  if (isProd) {
    cookieStr += `; Secure`;
  }
  const prev = res.getHeader('Set-Cookie');
  if (!prev) {
    res.setHeader('Set-Cookie', cookieStr);
  } else if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', [...prev, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [prev, cookieStr]);
  }
};

/**
 * Helper to parse expiry duration string into milliseconds
 * Max allowed duration is 24 hours. Default is 10 minutes.
 */
const parseDurationMs = (durationStr) => {
  if (!durationStr || durationStr === 'undefined' || durationStr === 'never' || durationStr === 'none') {
    return null; // Link never expires (undefined)
  }

  const str = String(durationStr).trim().toLowerCase();
  if (str === '1w' || str === '7d' || str === 'week') return 7 * 24 * 60 * 60 * 1000;
  if (str === '1m' || str === '1mo' || str === '30d' || str === 'month') return 30 * 24 * 60 * 60 * 1000;

  const match = str.match(/^(\d+)\s*(m|min|minutes?|h|hours?|d|days?|w|weeks?|mo|months?)$/i);
  if (!match) return 60 * 60 * 1000; // 1 hour default

  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (unit.startsWith('m') && !unit.startsWith('mo')) {
    return val * 60 * 1000;
  } else if (unit.startsWith('h')) {
    return val * 60 * 60 * 1000;
  } else if (unit.startsWith('d')) {
    return val * 24 * 60 * 60 * 1000;
  } else if (unit.startsWith('w')) {
    return val * 7 * 24 * 60 * 60 * 1000;
  } else if (unit.startsWith('mo')) {
    return val * 30 * 24 * 60 * 60 * 1000;
  }

  return 60 * 60 * 1000;
};


// ============================================================================
// TORRENT SWARM & WEBRTC SIGNALING REGISTRY (Zero-Server-Disk & Zero-Server-RAM)
// ============================================================================

/**
 * Active Seeders Map:
 * Map<fileCode, Map<clientId, { lastSeen: timestamp }>>
 */
const activeSeeders = new Map();

/**
 * Pending Piece Requests Map:
 * Map<requestId, { code, pieceIndex, res, req, createdAt, timeoutHandle }>
 */
const pendingPieceRequests = new Map();

/**
 * WebRTC Signaling Registry:
 * Relays SDP offer/answer and ICE candidates between peers without storing file data.
 * Map<toClientId, Array<{ fromClientId, code, signal, timestamp }>>
 */
const pendingSignals = new Map();

const MAX_PENDING_SIGNALS_MAP = 300; // Cap max active client mailboxes
const MAX_SIGNALS_PER_PEER = 30; // Cap max messages per client queue
const MAX_PENDING_PIECE_REQUESTS = 60; // Cap max concurrent waiting pieces in RAM

/**
 * Unlocked Sessions Cache for Password-Protected Files:
 * Map<unlockToken, { code, expiresAt }>
 */
const unlockedSessions = new Map();

const isTokenUnlockedForCode = (token, code) => {
  if (!token || typeof token !== 'string') return false;
  const session = unlockedSessions.get(token);
  if (!session) return false;
  if (session.code !== code) return false;
  if (Date.now() > session.expiresAt) {
    unlockedSessions.delete(token);
    return false;
  }
  return true;
};

const sendSignalToPeer = (toClientId, signalObj) => {
  if (typeof toClientId !== 'string' || toClientId.length > 100) return;
  if (!pendingSignals.has(toClientId) && pendingSignals.size >= MAX_PENDING_SIGNALS_MAP) {
    const oldestKey = pendingSignals.keys().next().value;
    if (oldestKey) pendingSignals.delete(oldestKey);
  }
  if (!pendingSignals.has(toClientId)) {
    pendingSignals.set(toClientId, []);
  }
  const queue = pendingSignals.get(toClientId);
  queue.push(signalObj);
  if (queue.length > MAX_SIGNALS_PER_PEER) queue.shift();
};

const drainSignalsForPeer = (clientId) => {
  if (typeof clientId !== 'string') return [];
  const queue = pendingSignals.get(clientId);
  if (!queue || queue.length === 0) return [];
  pendingSignals.delete(clientId);
  return queue;
};

/**
 * Helper: Prune inactive seeders (older than 35s)
 */
const pruneInactiveSeeders = (code) => {
  const codeSeeders = activeSeeders.get(code);
  if (!codeSeeders) return 0;

  const now = Date.now();
  for (const [clientId, info] of codeSeeders.entries()) {
    if (now - info.lastSeen > 35000) {
      codeSeeders.delete(clientId);
    }
  }

  if (codeSeeders.size === 0) {
    activeSeeders.delete(code);
    return 0;
  }
  return codeSeeders.size;
};

/**
 * Helper: Count active seeders for a file code
 */
const getSeederCount = (code) => {
  return pruneInactiveSeeders(code);
};

// Automatic Memory Garbage Collection Sweep (Runs every 30s)
setInterval(() => {
  const now = Date.now();
  // 1. Purge dead/abandoned pending piece requests older than 25s
  for (const [reqId, info] of pendingPieceRequests.entries()) {
    if (now - info.createdAt > 25000) {
      if (info.timeoutHandle) clearTimeout(info.timeoutHandle);
      pendingPieceRequests.delete(reqId);
    }
  }
  // 2. Purge stale seeders (> 40s inactive)
  for (const [code, seederMap] of activeSeeders.entries()) {
    for (const [clientId, info] of seederMap.entries()) {
      if (now - info.lastSeen > 40000) {
        seederMap.delete(clientId);
      }
    }
    if (seederMap.size === 0) {
      activeSeeders.delete(code);
    }
  }
  // 3. Purge stale WebRTC signals older than 30s
  for (const [clientId, queue] of pendingSignals.entries()) {
    const filtered = queue.filter((s) => now - s.timestamp < 30000);
    if (filtered.length === 0) {
      pendingSignals.delete(clientId);
    } else {
      pendingSignals.set(clientId, filtered);
    }
  }
}, 30000);

// ============================================================================
// CONTROLLERS
// ============================================================================

/**
 * Controller: POST /api/files/upload
 * Zero-RAM torrent metadata registration (Files stored 100% on user device)
 */
const uploadFile = async (req, res, next) => {
  try {
    const {
      duration,
      password,
      maxDownloads,
      fileName,
      originalName: rawOriginalName,
      fileSize,
      size: rawSize,
      mimeType,
      pieceSize: clientPieceSize,
      fileHash: rawFileHash,
    } = req.body || {};

    let sanitizedFileHash = null;
    if (rawFileHash && typeof rawFileHash === 'string' && /^[a-fA-F0-9]{64}$/.test(rawFileHash.trim())) {
      sanitizedFileHash = rawFileHash.trim().toLowerCase();
    }

    // 1. Retrieve or generate user identity cookie token
    let uploaderToken = req.cookies ? req.cookies.uploader_token : null;
    if (!uploaderToken) {
      uploaderToken = crypto.randomBytes(16).toString('hex');
    }
    setCookieHeader(res, 'uploader_token', uploaderToken, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    // 2. Extract and sanitize file metadata
    const rawName = (rawOriginalName || fileName || (req.file ? req.file.originalname : 'unnamed_file')).trim();
    // Strip control characters and HTML tags to prevent XSS / UI injection attacks
    const name = rawName.replace(/[\x00-\x1F\x7F<>]/g, '').slice(0, 255).trim() || 'unnamed_file';
    let sanitizedName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!sanitizedName || sanitizedName === '.' || sanitizedName.replace(/_/g, '').length === 0) {
      sanitizedName = 'file.bin';
    }

    let size = parseInt(rawSize || fileSize || (req.file ? req.file.size : 0), 10);
    if (isNaN(size) || size < 0) size = 0;
    const MAX_ALLOWED_SIZE = 50 * 1024 * 1024 * 1024; // 50 GB maximum safe threshold
    if (size > MAX_ALLOWED_SIZE) {
      return res.status(400).json({ success: false, message: 'File size exceeds 50 GB maximum limit.' });
    }

    const resolvedMimeType = (mimeType || (req.file ? req.file.mimetype : 'application/octet-stream')).slice(0, 100);

    // 3. Compute torrent pieces (Piece size clamped between 64 KB and 4 MB, default 512 KB)
    let PIECE_SIZE = parseInt(clientPieceSize, 10);
    if (isNaN(PIECE_SIZE) || PIECE_SIZE < 64 * 1024 || PIECE_SIZE > 4 * 1024 * 1024) {
      PIECE_SIZE = 512 * 1024;
    }
    const totalPieces = size > 0 ? Math.ceil(size / PIECE_SIZE) : 1;
    if (totalPieces > 100000) {
      return res.status(400).json({ success: false, message: 'Piece count exceeds maximum allowed.' });
    }

    // 4. Compute expiresAt timestamp (null means never expires / undefined)
    const durationMs = parseDurationMs(duration);
    const createdAt = new Date();
    const expiresAt = durationMs ? new Date(createdAt.getTime() + durationMs) : null;

    // 5. Password hash if provided
    let passwordHash = null;
    if (password && String(password).trim().length > 0) {
      passwordHash = await bcrypt.hash(String(password).trim(), 10);
    }

    // 6. Generate unique uppercase share code
    const fileCode = await generateUniqueCode();

    // 7. Generate 256-bit cryptographically secure owner secret token (No-login creator verification)
    const ownerSecretToken = crypto.randomBytes(32).toString('hex');
    const hashedSecret = crypto.createHash('sha256').update(ownerSecretToken).digest('hex');

    // 8. Set HttpOnly owner cookies with cryptographic secret
    if (expiresAt) {
      setCookieHeader(res, `file_owner_token_${fileCode}`, ownerSecretToken, { expires: expiresAt });
      setCookieHeader(res, `file_owner_${fileCode}`, fileCode, { expires: expiresAt });
    } else {
      setCookieHeader(res, `file_owner_token_${fileCode}`, ownerSecretToken, { maxAge: 365 * 24 * 60 * 60 * 1000 });
      setCookieHeader(res, `file_owner_${fileCode}`, fileCode, { maxAge: 365 * 24 * 60 * 60 * 1000 });
    }

    // 9. Create SQLite database record (Zero server disk file usage)
    const fileRecord = new File({
      code: fileCode,
      originalName: name,
      sanitizedName,
      mimeType: resolvedMimeType,
      size,
      pieceSize: PIECE_SIZE,
      totalPieces,
      storageProvider: 'peer_to_peer',
      filePath: 'indexeddb',
      uploaderIp: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      uploaderToken: uploaderToken,
      creatorTokenHash: hashedSecret,
      createdAt,
      expiresAt,
      maxDownloads: null,
      passwordHash,
      fileHash: sanitizedFileHash,
    });

    await fileRecord.save();

    const clientOrigin = process.env.CLIENT_ORIGIN || `${req.protocol}://${req.get('host')}`;
    const downloadUrl = `${clientOrigin}/download/${fileCode}`;

    res.status(201).json({
      success: true,
      message: 'File registered for peer sharing! Stored safely on your local device.',
      code: fileCode,
      creatorToken: ownerSecretToken,
      file: {
        code: fileCode,
        originalName: fileRecord.originalName,
        size: fileRecord.size,
        mimeType: fileRecord.mimeType,
        pieceSize: fileRecord.pieceSize,
        totalPieces: fileRecord.totalPieces,
        storageProvider: fileRecord.storageProvider,
        createdAt: fileRecord.createdAt,
        expiresAt: fileRecord.expiresAt,
        isPasswordProtected: !!passwordHash,
        fileHash: fileRecord.fileHash,
        downloadUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: POST /api/files/swarm/heartbeat
 * Active clients (seeders & downloaders with files in IndexedDB) announce the codes they hold
 */
const handleSwarmHeartbeat = async (req, res, next) => {
  try {
    const { clientId, seedingCodes } = req.body || {};
    if (!clientId || !Array.isArray(seedingCodes)) {
      return res.status(400).json({ success: false, message: 'Invalid heartbeat payload' });
    }

    const now = Date.now();
    const activeCounts = {};
    const heldCodesSet = new Set();

    seedingCodes.forEach((rawCode) => {
      const clean = sanitizeCode(rawCode);
      if (clean) {
        heldCodesSet.add(clean);
        if (!activeSeeders.has(clean)) {
          activeSeeders.set(clean, new Map());
        }
        const seederMap = activeSeeders.get(clean);
        seederMap.set(clientId, { lastSeen: now });
        activeCounts[clean] = seederMap.size;
      }
    });

    // Check which held codes actually have waiting piece requests to eliminate idle polling
    const pendingCodes = [];
    pendingPieceRequests.forEach((val) => {
      if (heldCodesSet.has(val.code) && !pendingCodes.includes(val.code)) {
        pendingCodes.push(val.code);
      }
    });

    // Drain any pending WebRTC signaling messages for this seeder
    const signals = drainSignalsForPeer(clientId);

    res.json({
      success: true,
      activeCounts,
      pendingCodes,
      signals,
      timestamp: now,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: GET /api/files/swarm/:code/status
 * Check swarm health, active seeder count, and piece metrics
 */
const getSwarmStatus = async (req, res, next) => {
  try {
    const cleanCode = sanitizeCode(req.params.code);
    if (!cleanCode) {
      return res.status(400).json({
        success: false,
        error: 'invalid_code',
        message: 'Invalid file code format. Codes must be 4 to 12 alphanumeric characters.',
      });
    }

    const fileRecord = await File.findOne({ code: cleanCode });
    if (!fileRecord) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: `File code '${cleanCode}' was not found.`,
      });
    }

    if (fileRecord.isDeleted) {
      return res.status(410).json({
        success: false,
        error: 'deleted',
        isDeleted: true,
        message: 'This file share was revoked and deleted by its creator.',
      });
    }

    if (fileRecord.expiresAt && new Date(fileRecord.expiresAt) <= new Date()) {
      return res.status(410).json({
        success: false,
        error: 'expired',
        isExpired: true,
        expiredAt: fileRecord.expiresAt,
        message: 'This file link has expired and is no longer available.',
      });
    }

    if (fileRecord.maxDownloads && fileRecord.downloadCount >= fileRecord.maxDownloads) {
      return res.status(410).json({
        success: false,
        error: 'max_downloads_reached',
        message: 'Maximum download limit reached for this file.',
      });
    }

    const seedersCount = getSeederCount(cleanCode);
    const seederMap = activeSeeders.get(cleanCode);
    const seederIds = seederMap ? Array.from(seederMap.keys()) : [];

    res.json({
      success: true,
      code: cleanCode,
      originalName: fileRecord.originalName,
      size: fileRecord.size,
      mimeType: fileRecord.mimeType,
      pieceSize: fileRecord.pieceSize || 512 * 1024,
      totalPieces: fileRecord.totalPieces || Math.ceil(fileRecord.size / (512 * 1024)),
      seedersCount,
      seederIds, // Anonymous peer tokens for WebRTC connection matchmaking
      isPasswordProtected: !!fileRecord.passwordHash,
      expiresAt: fileRecord.expiresAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: POST /api/files/swarm/:code/request-piece
 * Recipient requests piece `pieceIndex` from an active seeder in the swarm
 */
const requestPiece = async (req, res, next) => {
  try {
    const cleanCode = sanitizeCode(req.params.code);
    if (!cleanCode) {
      return res.status(400).json({
        success: false,
        error: 'invalid_code',
        message: 'Invalid file code format. Codes must be 4 to 12 alphanumeric characters.',
      });
    }

    const { pieceIndex, password, clientId, unlockToken: bodyToken } = req.body || {};
    const unlockToken = req.headers['x-unlock-token'] || bodyToken;
    const pIndex = parseInt(pieceIndex, 10);
    if (isNaN(pIndex) || pIndex < 0) {
      return res.status(400).json({
        success: false,
        error: 'invalid_piece_index',
        message: 'Invalid pieceIndex specified.',
      });
    }

    const fileRecord = await File.findOne({ code: cleanCode });
    if (!fileRecord) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: `File code '${cleanCode}' was not found.`,
      });
    }

    if (fileRecord.isDeleted) {
      return res.status(410).json({
        success: false,
        error: 'deleted',
        isDeleted: true,
        message: 'This file share was revoked and deleted by its creator.',
      });
    }

    if (fileRecord.expiresAt && new Date(fileRecord.expiresAt) <= new Date()) {
      return res.status(410).json({
        success: false,
        error: 'expired',
        isExpired: true,
        expiredAt: fileRecord.expiresAt,
        message: 'This file link has expired and is no longer available.',
      });
    }

    if (fileRecord.maxDownloads && fileRecord.downloadCount >= fileRecord.maxDownloads) {
      return res.status(410).json({
        success: false,
        error: 'max_downloads_reached',
        message: 'Maximum download limit reached for this file.',
      });
    }

    // Password / Unlock Token verification
    if (fileRecord.passwordHash) {
      const isTokenValid = isTokenUnlockedForCode(unlockToken, cleanCode);
      if (!isTokenValid) {
        if (!password) {
          return res.status(401).json({
            success: false,
            error: 'password_required',
            message: 'Password required to download this file.',
          });
        }
        const match = await bcrypt.compare(String(password), fileRecord.passwordHash);
        if (!match) {
          return res.status(401).json({
            success: false,
            error: 'password_incorrect',
            message: 'Incorrect password entered.',
          });
        }
      }
    }

    // Check seeders count
    const seeders = getSeederCount(cleanCode);
    if (seeders === 0) {
      return res.status(503).json({
        success: false,
        error: 'no_seeders',
        message: 'No active seeders online for this file. Please wait for an active seeder to connect.',
        seedersCount: 0,
      });
    }

    if (pendingPieceRequests.size >= MAX_PENDING_PIECE_REQUESTS) {
      return res.status(503).json({
        success: false,
        error: 'queue_busy',
        message: 'Piece transfer queue is busy. Please retry in a moment.',
      });
    }

    // Generate unique request ID
    const requestId = `piece_${cleanCode}_${pIndex}_${crypto.randomBytes(6).toString('hex')}`;

    // Store request in pending piece queue
    const timeoutHandle = setTimeout(() => {
      if (pendingPieceRequests.has(requestId)) {
        pendingPieceRequests.delete(requestId);
        if (!res.headersSent) {
          res.status(504).json({
            success: false,
            message: `Piece ${pIndex} request timed out waiting for seeder response.`,
          });
        }
      }
    }, 20000);

    // Clean up immediately if client aborts connection
    req.on('close', () => {
      clearTimeout(timeoutHandle);
      pendingPieceRequests.delete(requestId);
    });

    pendingPieceRequests.set(requestId, {
      code: cleanCode,
      pieceIndex: pIndex,
      res,
      req,
      createdAt: Date.now(),
      timeoutHandle,
    });

    // Notify any waiting seeder connection or response will be fulfilled by serve-piece
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: GET /api/files/swarm/:code/pending-pieces
 * Seeders check which pieces need to be served for this file
 */
const getPendingPieceRequests = async (req, res, next) => {
  try {
    const cleanCode = sanitizeCode(req.params.code);
    if (!cleanCode) {
      return res.status(400).json({ success: false, message: 'Invalid file code format.' });
    }

    const pending = [];
    pendingPieceRequests.forEach((val, reqId) => {
      if (val.code === cleanCode) {
        pending.push({
          requestId: reqId,
          pieceIndex: val.pieceIndex,
        });
      }
    });

    res.json({
      success: true,
      pendingRequests: pending.slice(0, 10), // Batch up to 10 pieces
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: POST /api/files/swarm/:code/serve-piece
 * Seeder submits piece binary/base64 chunk to fulfill a pending piece request
 */
const servePiece = async (req, res, next) => {
  try {
    const cleanCode = sanitizeCode(req.params.code);
    const { requestId, pieceIndex, pieceBase64, isLastPiece } = req.body || {};

    if (!requestId || !pieceBase64 || typeof pieceBase64 !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing or invalid pieceBase64 data.' });
    }

    // Limit base64 length to 6MB (4MB chunk + base64 overhead) to prevent heap overflow
    if (pieceBase64.length > 6 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Chunk exceeds maximum 4MB piece size.' });
    }

    const pending = pendingPieceRequests.get(requestId);
    if (!pending) {
      return res.status(404).json({ success: false, message: 'Piece request expired or already fulfilled.' });
    }

    clearTimeout(pending.timeoutHandle);
    pendingPieceRequests.delete(requestId);

    const chunkBuffer = Buffer.from(pieceBase64, 'base64');
    if (chunkBuffer.length > 4 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Chunk buffer exceeds maximum 4MB limit.' });
    }

    if (!pending.res.headersSent) {
      pending.res.setHeader('Content-Type', 'application/octet-stream');
      pending.res.setHeader('Content-Length', chunkBuffer.length);
      pending.res.setHeader('X-Piece-Index', pieceIndex);
      pending.res.send(chunkBuffer);
    }

    // Increment download count if final piece was successfully fulfilled
    if (isLastPiece) {
      File.findOne({ code: cleanCode, isDeleted: false }).then((fileRecord) => {
        if (fileRecord) {
          fileRecord.incrementDownload();
        }
      }).catch((err) => console.error('[Swarm DownloadCount Error]', err));
    }

    res.json({ success: true, message: 'Piece served successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: GET /api/files/:code
 * Fetch metadata for download page display
 */
const getFileMetadata = async (req, res, next) => {
  try {
    const cleanCode = sanitizeCode(req.params.code);
    if (!cleanCode) {
      return res.status(400).json({
        success: false,
        error: 'invalid_code',
        message: 'Invalid file code format. Codes must be 4 to 12 alphanumeric characters.',
      });
    }

    const fileRecord = await File.findOne({ code: cleanCode });
    if (!fileRecord) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: `File code '${cleanCode}' was not found. Please verify the code or request a new link from the sender.`,
      });
    }

    if (fileRecord.isDeleted) {
      return res.status(410).json({
        success: false,
        error: 'deleted',
        isDeleted: true,
        message: 'This file share was revoked and deleted by its creator.',
      });
    }

    if (fileRecord.expiresAt && new Date(fileRecord.expiresAt) <= new Date()) {
      return res.status(410).json({
        success: false,
        error: 'expired',
        isExpired: true,
        expiredAt: fileRecord.expiresAt,
        message: 'This file link has expired and is no longer available.',
      });
    }

    if (fileRecord.maxDownloads && fileRecord.downloadCount >= fileRecord.maxDownloads) {
      return res.status(410).json({
        success: false,
        error: 'max_downloads_reached',
        message: 'This file has reached its maximum download limit and is no longer accessible.',
      });
    }

    // Check if requester is verified owner or holds an active unlockToken
    const cookies = req.cookies || {};
    const headerToken = req.headers['x-creator-token'];
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
    const cookieToken = cookies[`file_owner_token_${fileRecord.code}`];
    const candidateOwnerToken = headerToken || bearerToken || cookieToken;

    let isOwner = false;
    if (candidateOwnerToken && fileRecord.creatorTokenHash) {
      try {
        const hashedCandidate = crypto.createHash('sha256').update(candidateOwnerToken).digest('hex');
        if (hashedCandidate.length === fileRecord.creatorTokenHash.length) {
          isOwner = crypto.timingSafeEqual(Buffer.from(hashedCandidate, 'utf-8'), Buffer.from(fileRecord.creatorTokenHash, 'utf-8'));
        }
      } catch (_) {}
    }

    const unlockToken = req.headers['x-unlock-token'] || req.query.unlockToken;
    const isUnlocked = !fileRecord.passwordHash || isOwner || isTokenUnlockedForCode(unlockToken, cleanCode);

    const seedersCount = getSeederCount(cleanCode);

    res.json({
      success: true,
      file: {
        code: fileRecord.code,
        originalName: isUnlocked ? fileRecord.originalName : 'Protected File (Folder Locked)',
        size: fileRecord.size,
        mimeType: isUnlocked ? fileRecord.mimeType : 'application/octet-stream',
        pieceSize: fileRecord.pieceSize || (512 * 1024),
        totalPieces: fileRecord.totalPieces || Math.ceil(fileRecord.size / (512 * 1024)),
        storageProvider: fileRecord.storageProvider,
        createdAt: fileRecord.createdAt,
        expiresAt: fileRecord.expiresAt,
        downloadCount: fileRecord.downloadCount,
        isPasswordProtected: !!fileRecord.passwordHash,
        isUnlocked,
        isFolderLocked: !isUnlocked,
        fileHash: isUnlocked ? fileRecord.fileHash : null,
        seedersCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: POST /api/files/:code/unlock
 * Verify password for protected file container/folder and issue temporary unlockToken
 */
const unlockFile = async (req, res, next) => {
  try {
    const cleanCode = sanitizeCode(req.params.code);
    if (!cleanCode) {
      return res.status(400).json({ success: false, message: 'Invalid file code format.' });
    }

    const fileRecord = await File.findOne({ code: cleanCode });
    if (!fileRecord || fileRecord.isDeleted) {
      return res.status(404).json({ success: false, message: `File code '${cleanCode}' was not found.` });
    }

    if (fileRecord.checkIsExpired()) {
      return res.status(410).json({ success: false, message: 'This file link has expired.' });
    }

    if (!fileRecord.passwordHash) {
      return res.json({
        success: true,
        message: 'No password required for this file.',
        unlockToken: 'unprotected',
        file: {
          code: fileRecord.code,
          originalName: fileRecord.originalName,
          size: fileRecord.size,
          mimeType: fileRecord.mimeType,
          pieceSize: fileRecord.pieceSize || (512 * 1024),
          totalPieces: fileRecord.totalPieces || Math.ceil(fileRecord.size / (512 * 1024)),
          storageProvider: fileRecord.storageProvider,
          createdAt: fileRecord.createdAt,
          expiresAt: fileRecord.expiresAt,
          downloadCount: fileRecord.downloadCount,
          isPasswordProtected: false,
          isUnlocked: true,
          isFolderLocked: false,
          fileHash: fileRecord.fileHash,
          seedersCount: getSeederCount(cleanCode),
        },
      });
    }

    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Password required to unlock folder.' });
    }

    const isMatch = await bcrypt.compare(String(password).trim(), fileRecord.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'password_incorrect',
        message: 'Incorrect password entered. Folder remains locked.',
      });
    }

    const unlockToken = crypto.randomBytes(32).toString('hex');
    unlockedSessions.set(unlockToken, {
      code: cleanCode,
      expiresAt: Date.now() + 4 * 60 * 60 * 1000, // 4 hours
    });

    res.json({
      success: true,
      message: 'Folder unlocked successfully!',
      unlockToken,
      file: {
        code: fileRecord.code,
        originalName: fileRecord.originalName,
        size: fileRecord.size,
        mimeType: fileRecord.mimeType,
        pieceSize: fileRecord.pieceSize || (512 * 1024),
        totalPieces: fileRecord.totalPieces || Math.ceil(fileRecord.size / (512 * 1024)),
        storageProvider: fileRecord.storageProvider,
        createdAt: fileRecord.createdAt,
        expiresAt: fileRecord.expiresAt,
        downloadCount: fileRecord.downloadCount,
        isPasswordProtected: true,
        isUnlocked: true,
        isFolderLocked: false,
        fileHash: fileRecord.fileHash,
        seedersCount: getSeederCount(cleanCode),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: DELETE /api/files/:code
 * Early manual file deletion by uploader
 */
const deleteFile = async (req, res, next) => {
  try {
    const cleanCode = sanitizeCode(req.params.code);
    if (!cleanCode) {
      return res.status(400).json({
        success: false,
        error: 'invalid_code',
        message: 'Invalid file code format.',
      });
    }

    const fileRecord = await File.findOne({ code: cleanCode });
    if (!fileRecord) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: `File code '${cleanCode}' does not exist.`,
      });
    }

    if (fileRecord.isDeleted) {
      return res.status(410).json({
        success: false,
        error: 'already_deleted',
        message: `File code '${cleanCode}' has already been deleted.`,
      });
    }

    // Verify ownership with maximum cryptographic security (No login required)
    const cookies = req.cookies || {};
    const headerToken = req.headers['x-creator-token'];
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
    const cookieToken = cookies[`file_owner_token_${fileRecord.code}`];
    const uploaderSessionToken = cookies.uploader_token;

    // Highest priority: 256-bit cryptographic bearer token
    // Highest priority: 256-bit cryptographic bearer token
    const candidateToken = headerToken || bearerToken || cookieToken;

    let isOwner = false;
    if (candidateToken) {
      try {
        const hashedCandidate = crypto.createHash('sha256').update(candidateToken).digest('hex');
        const tokenTarget = fileRecord.creatorTokenHash || fileRecord.uploaderToken;
        if (tokenTarget) {
          if (hashedCandidate.length === tokenTarget.length) {
            isOwner = crypto.timingSafeEqual(
              Buffer.from(hashedCandidate, 'utf-8'),
              Buffer.from(tokenTarget, 'utf-8')
            );
          }
          if (!isOwner && candidateToken.length === tokenTarget.length) {
            isOwner = crypto.timingSafeEqual(
              Buffer.from(candidateToken, 'utf-8'),
              Buffer.from(tokenTarget, 'utf-8')
            );
          }
        }
      } catch (err) {
        console.error('[Delete Auth Error]', err);
      }
    }

    // Secondary fallback: uploader general session token
    if (!isOwner && uploaderSessionToken && fileRecord.uploaderToken) {
      try {
        if (uploaderSessionToken.length === fileRecord.uploaderToken.length) {
          isOwner = crypto.timingSafeEqual(
            Buffer.from(uploaderSessionToken, 'utf-8'),
            Buffer.from(fileRecord.uploaderToken, 'utf-8')
          );
        }
      } catch (_) {}
    }

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Valid cryptographic creator authorization required to delete this file.',
      });
    }

    // Soft delete: mark as deleted so downloaders get descriptive 410 'deleted'
    fileRecord.isDeleted = true;
    await fileRecord.save();

    // Clean up from swarm registry
    activeSeeders.delete(cleanCode);

    // Clear file cookies
    clearCookieHeader(res, `file_owner_token_${fileRecord.code}`);
    clearCookieHeader(res, `file_owner_${fileRecord.code}`);

    res.json({
      success: true,
      message: `File code '${cleanCode}' successfully deleted and share link deactivated.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: GET /api/files/my-shared
 * Fetch files uploaded/shared by current user
 */
const getMySharedFiles = async (req, res, next) => {
  try {
    const now = new Date();
    const uploaderToken = req.cookies ? req.cookies.uploader_token : null;
    const cookies = req.cookies || {};

    const fileOwnerCodes = [];
    Object.keys(cookies).forEach((key) => {
      if (key.startsWith('file_owner_token_')) {
        const clean = sanitizeCode(key.replace('file_owner_token_', ''));
        if (clean) fileOwnerCodes.push(clean);
      } else if (key.startsWith('file_owner_')) {
        const clean = sanitizeCode(key.replace('file_owner_', ''));
        if (clean) fileOwnerCodes.push(clean);
      }
    });

    if (!uploaderToken && fileOwnerCodes.length === 0) {
      return res.json({ success: true, count: 0, files: [] });
    }

    const queryConditions = [];
    if (uploaderToken) {
      queryConditions.push({ uploaderToken });
    }
    if (fileOwnerCodes.length > 0) {
      queryConditions.push({ code: { $in: fileOwnerCodes } });
    }

    const activeFiles = await File.find({
      isDeleted: false,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } },
      ],
      $and: [
        { $or: queryConditions },
      ],
    }).sort({ createdAt: -1 });

    const activeCodesSet = new Set(activeFiles.map((f) => f.code));

    // Clear stale cookies
    fileOwnerCodes.forEach((c) => {
      if (!activeCodesSet.has(c)) {
        clearCookieHeader(res, `file_owner_token_${c}`);
        clearCookieHeader(res, `file_owner_${c}`);
      }
    });

    const formatted = activeFiles.map((f) => ({
      id: f._id || f.id,
      code: f.code,
      originalName: f.originalName,
      size: f.size,
      mimeType: f.mimeType,
      pieceSize: f.pieceSize || 512 * 1024,
      totalPieces: f.totalPieces || Math.ceil(f.size / (512 * 1024)),
      storageProvider: f.storageProvider,
      createdAt: f.createdAt,
      expiresAt: f.expiresAt,
      downloadCount: f.downloadCount,
      isPasswordProtected: !!f.passwordHash,
      seedersCount: getSeederCount(f.code),
    }));

    res.json({
      success: true,
      count: formatted.length,
      files: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: POST /api/files/swarm/:code/signal
 * Relays WebRTC signaling (offer, answer, ice-candidate) between peers (0 server RAM file transfer)
 */
const sendSwarmSignal = async (req, res, next) => {
  try {
    const cleanCode = sanitizeCode(req.params.code);
    if (!cleanCode) {
      return res.status(400).json({ success: false, message: 'Invalid file code.' });
    }

    const { fromClientId, toClientId, signal } = req.body || {};
    if (!fromClientId || !signal || typeof fromClientId !== 'string' || fromClientId.length > 100) {
      return res.status(400).json({ success: false, message: 'Missing or invalid fromClientId or signal.' });
    }

    if (toClientId && (typeof toClientId !== 'string' || toClientId.length > 100)) {
      return res.status(400).json({ success: false, message: 'Invalid toClientId.' });
    }

    // Limit signal payload size to 64 KB JSON to prevent memory exhaustion
    const signalStr = typeof signal === 'string' ? signal : JSON.stringify(signal);
    if (signalStr.length > 65536) {
      return res.status(400).json({ success: false, message: 'Signal payload exceeds 64KB limit.' });
    }

    // Enforce cryptographic password protection on WebRTC signaling
    const fileRecord = await File.findOne({ code: cleanCode, isDeleted: false });
    if (fileRecord && fileRecord.passwordHash) {
      const seederMap = activeSeeders.get(cleanCode);
      const isRegisteredSeeder = seederMap && seederMap.has(fromClientId);
      const unlockToken = req.headers['x-unlock-token'] || (req.body ? req.body.unlockToken : null);
      const isUnlocked = isTokenUnlockedForCode(unlockToken, cleanCode);

      if (!isRegisteredSeeder && !isUnlocked) {
        return res.status(401).json({
          success: false,
          error: 'password_required',
          message: 'Access denied: Password unlock token required for WebRTC signaling.',
        });
      }
    }

    let targetPeerId = toClientId;
    if (!targetPeerId || targetPeerId === 'seeder') {
      const seederMap = activeSeeders.get(cleanCode);
      if (seederMap && seederMap.size > 0) {
        targetPeerId = Array.from(seederMap.keys())[0];
      }
    }

    if (!targetPeerId) {
      return res.status(404).json({ success: false, message: 'Target peer not found or offline.' });
    }

    sendSignalToPeer(targetPeerId, {
      fromClientId,
      toClientId: targetPeerId,
      code: cleanCode,
      signal,
      timestamp: Date.now(),
    });

    res.json({ success: true, deliveredTo: targetPeerId });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: GET /api/files/swarm/:code/signals
 * Drain incoming WebRTC signals for a client
 */
const getSwarmSignals = async (req, res, next) => {
  try {
    const clientId = req.query.clientId || req.headers['x-client-id'];
    if (!clientId) {
      return res.status(400).json({ success: false, message: 'clientId required.' });
    }

    const signals = drainSignalsForPeer(clientId);
    res.json({ success: true, signals });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: POST /api/files/swarm/:code/complete
 * Downloader announces download completed via WebRTC to update metrics
 */
const recordDownloadComplete = async (req, res, next) => {
  try {
    const cleanCode = sanitizeCode(req.params.code);
    if (!cleanCode) return res.status(400).json({ success: false });

    const fileRecord = await File.findOne({ code: cleanCode, isDeleted: false });
    if (fileRecord) {
      await fileRecord.incrementDownload();
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadFile,
  getFileMetadata,
  unlockFile,
  deleteFile,
  getMySharedFiles,
  handleSwarmHeartbeat,
  getSwarmStatus,
  requestPiece,
  getPendingPieceRequests,
  servePiece,
  sendSwarmSignal,
  getSwarmSignals,
  recordDownloadComplete,
};
