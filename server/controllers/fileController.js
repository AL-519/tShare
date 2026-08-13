const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const File = require('../models/File');
const storageService = require('../services/storage.services');
const { generateUniqueCode } = require('../services/codeGenerator');

/**
 * Native HTTP cookie helpers to set and clear cookies cleanly
 */
const setCookieHeader = (res, name, value, options = {}) => {
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
  let cookieStr = `${encodeURIComponent(name)}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly`;
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
  const defaultMs = 10 * 60 * 1000; // 10 minutes default
  if (!durationStr) return defaultMs;

  const match = String(durationStr).trim().match(/^(\d+)\s*(m|min|minutes?|h|hours?|d|days?)$/i);
  if (!match) return defaultMs;

  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  let ms = defaultMs;
  if (unit.startsWith('m')) {
    ms = val * 60 * 1000;
  } else if (unit.startsWith('h')) {
    ms = val * 60 * 60 * 1000;
  } else if (unit.startsWith('d')) {
    ms = val * 24 * 60 * 60 * 1000;
  }

  const maxMs = 24 * 60 * 60 * 1000; // Server-side 24h cap enforcement
  return Math.min(ms, maxMs);
};

// In-memory registry for peer stream relays (code -> pending recipient requests)
const pendingStreamRequests = new Map(); // requestId -> { code, res, req, createdAt }

/**
 * Controller: POST /api/files/upload
 * Handle file upload, metadata saving, and set user/file cookies (zero disk usage for device_local)
 */
const uploadFile = async (req, res, next) => {
  try {
    const { duration, storageProvider, password, maxDownloads, fileName, fileSize, mimeType } = req.body;

    const preferredProvider = storageProvider || process.env.STORAGE_PROVIDER || 'device_local';

    if (preferredProvider !== 'device_local' && !req.file) {
      return res.status(400).json({ success: false, message: 'No file buffer provided for cloud upload.' });
    }

    // 1. Retrieve or generate user identity cookie token
    let uploaderToken = req.cookies ? req.cookies.uploader_token : null;
    if (!uploaderToken) {
      uploaderToken = crypto.randomBytes(16).toString('hex');
    }
    setCookieHeader(res, 'uploader_token', uploaderToken, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });

    // 2. Extract original filename & metadata
    const rawName = req.file ? req.file.originalname : (fileName || 'unnamed_file');
    const originalName = rawName;
    const sanitizedName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const resolvedSize = req.file ? req.file.size : (parseInt(fileSize || '0', 10) || 0);
    const resolvedMimeType = req.file ? req.file.mimetype : (mimeType || 'application/octet-stream');

    // Enforce 200 MB maximum file size limit
    const maxFileSizeMb = parseInt(process.env.MAX_FILE_SIZE_MB || '200', 10);
    const maxSizeBytes = maxFileSizeMb * 1024 * 1024;

    if (resolvedSize > maxSizeBytes) {
      return res.status(400).json({
        success: false,
        message: `File size (${(resolvedSize / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed limit of ${maxFileSizeMb} MB.`,
      });
    }

    // 3. Save file using storage service (zero server disk usage for device_local!)
    const savedStorage = await storageService.saveFile({
      buffer: req.file ? req.file.buffer : null,
      originalName: sanitizedName,
      provider: preferredProvider,
    });

    // 4. Compute expiresAt timestamp with 24-hour max cap
    const durationMs = parseDurationMs(duration);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + durationMs);

    // 5. Password hash if provided
    let passwordHash = null;
    if (password && password.trim().length > 0) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    // 6. Max downloads limit validation
    let parsedMaxDownloads = null;
    if (maxDownloads && !isNaN(parseInt(maxDownloads, 10)) && parseInt(maxDownloads, 10) > 0) {
      parsedMaxDownloads = parseInt(maxDownloads, 10);
    }

    // 7. Generate unique share code
    const fileCode = await generateUniqueCode();

    // 8. Set per-file cookie that automatically expires at file's expiresAt
    setCookieHeader(res, `file_owner_${fileCode}`, fileCode, {
      expires: expiresAt,
    });

    // 9. Create Mongoose DB document
    const fileRecord = new File({
      code: fileCode,
      originalName,
      sanitizedName,
      mimeType: resolvedMimeType,
      size: resolvedSize,
      storageProvider: savedStorage.storageProvider,
      filePath: savedStorage.filePath,
      imagekitFileId: savedStorage.imagekitFileId,
      uploaderIp: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      uploaderToken,
      createdAt,
      expiresAt,
      maxDownloads: parsedMaxDownloads,
      passwordHash,
    });

    await fileRecord.save();

    const clientOrigin = process.env.CLIENT_ORIGIN || `${req.protocol}://${req.get('host')}`;
    const downloadUrl = `${clientOrigin}/download/${fileCode}`;

    res.status(201).json({
      success: true,
      message: 'File shared successfully using device local storage!',
      code: fileCode,
      file: {
        code: fileCode,
        originalName: fileRecord.originalName,
        size: fileRecord.size,
        mimeType: fileRecord.mimeType,
        storageProvider: fileRecord.storageProvider,
        createdAt: fileRecord.createdAt,
        expiresAt: fileRecord.expiresAt,
        isPasswordProtected: !!passwordHash,
        maxDownloads: fileRecord.maxDownloads,
        downloadUrl,
      },
    });
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
    const { code } = req.params;
    const codeQuery = { $regex: new RegExp(`^${code.trim()}$`, 'i') };
    const fileRecord = await File.findOne({ code: codeQuery, isDeleted: false });

    if (!fileRecord || fileRecord.checkIsExpired()) {
      return res.status(404).json({
        success: false,
        message: 'File not found, expired, or has reached maximum download limit.',
        isExpired: true,
      });
    }

    const isPasswordProtected = !!fileRecord.passwordHash;

    res.json({
      success: true,
      file: {
        code: fileRecord.code,
        originalName: fileRecord.originalName,
        size: fileRecord.size,
        mimeType: fileRecord.mimeType,
        storageProvider: fileRecord.storageProvider,
        createdAt: fileRecord.createdAt,
        expiresAt: fileRecord.expiresAt,
        downloadCount: fileRecord.downloadCount,
        maxDownloads: fileRecord.maxDownloads,
        isPasswordProtected,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: GET /api/files/:code/download
 * Validate expiry, verify password, increment download count, and serve/stream file
 */
const downloadFile = async (req, res, next) => {
  try {
    const { code } = req.params;
    const providedPassword = req.query.password || req.headers['x-file-password'];

    const codeQuery = { $regex: new RegExp(`^${code.trim()}$`, 'i') };
    const fileRecord = await File.findOne({ code: codeQuery, isDeleted: false });

    if (!fileRecord || fileRecord.checkIsExpired()) {
      return res.status(410).json({
        success: false,
        message: 'This file link has expired or reached its maximum download limit.',
        isExpired: true,
      });
    }

    // Password validation if protected
    if (fileRecord.passwordHash) {
      if (!providedPassword) {
        return res.status(401).json({
          success: false,
          message: 'Password required to download this file.',
          isPasswordRequired: true,
        });
      }

      const isMatch = await bcrypt.compare(String(providedPassword), fileRecord.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Incorrect password entered.',
        });
      }
    }

    // Serve file based on storage provider
    if (fileRecord.storageProvider === 'imagekit' && fileRecord.filePath.startsWith('http')) {
      const isInline = req.query.inline === 'true';

      if (isInline) {
        // Open/Play in new tab via direct CDN redirect (Inline Preview: DO NOT increment download count)
        return res.redirect(fileRecord.filePath);
      } else {
        // Direct File Download: Increment download count
        fileRecord.downloadCount += 1;
        if (fileRecord.maxDownloads !== null && fileRecord.downloadCount >= fileRecord.maxDownloads) {
          fileRecord.isDeleted = true;
        }
        await fileRecord.save();

        // Force attachment download with Content-Disposition header
        const https = require('https');
        const http = require('http');
        const httpModule = fileRecord.filePath.startsWith('https') ? https : http;

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileRecord.originalName)}"`);
        res.setHeader('Content-Type', fileRecord.mimeType || 'application/octet-stream');
        if (fileRecord.size) res.setHeader('Content-Length', fileRecord.size);

        return httpModule.get(fileRecord.filePath, (stream) => {
          stream.pipe(res);
        }).on('error', () => {
          const fallbackUrl = fileRecord.filePath.includes('?') 
            ? `${fileRecord.filePath}&ik-attachment=true` 
            : `${fileRecord.filePath}?ik-attachment=true`;
          res.redirect(fallbackUrl);
        });
      }
    } else if (fileRecord.storageProvider === 'device_local') {
      // Device local storage transfer
      const requestId = 'req_' + crypto.randomBytes(8).toString('hex');
      const isInline = req.query.inline === 'true';
      const disposition = isInline ? 'inline' : 'attachment';

      console.log(`[Server Download] Initiated device_local peer stream for file code '${code}' (requestId: '${requestId}', isInline: ${isInline})`);

      res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(fileRecord.originalName)}"`);
      res.setHeader('Content-Type', fileRecord.mimeType || 'application/octet-stream');
      if (fileRecord.size) res.setHeader('Content-Length', fileRecord.size);

      // Register stream recipient
      pendingStreamRequests.set(requestId, {
        code: fileRecord.code,
        res,
        fileRecord,
        isInline,
        createdAt: Date.now(),
      });

      // Cleanup timeout after 25s if uploader device doesn't stream chunks
      setTimeout(() => {
        if (pendingStreamRequests.has(requestId)) {
          const reqInfo = pendingStreamRequests.get(requestId);
          pendingStreamRequests.delete(requestId);
          console.warn(`[Server Download TIMEOUT] Stream request '${requestId}' for code '${code}' timed out (uploader device offline).`);
          if (!reqInfo.res.headersSent) {
            reqInfo.res.status(503).json({
              success: false,
              message: 'Uploader device is offline. Please ask the uploader to keep their browser tab open.',
            });
          }
        }
      }, 25000);

    } else {
      // Legacy local disk file streaming
      const localFilePath = path.resolve(fileRecord.filePath);

      if (!fs.existsSync(localFilePath)) {
        return res.status(404).json({
          success: false,
          message: 'Physical file missing from server storage.',
        });
      }

      const isInline = req.query.inline === 'true';
      if (!isInline) {
        fileRecord.downloadCount += 1;
        if (fileRecord.maxDownloads !== null && fileRecord.downloadCount >= fileRecord.maxDownloads) {
          fileRecord.isDeleted = true;
        }
        await fileRecord.save();
      }

      const disposition = isInline ? 'inline' : 'attachment';
      res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(fileRecord.originalName)}"`);
      res.setHeader('Content-Type', fileRecord.mimeType || 'application/octet-stream');
      
      const fileStream = fs.createReadStream(localFilePath);
      fileStream.pipe(res);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: GET /api/files/stream-check/:code
 * Uploader browser checks for pending download requests for its locally hosted file
 */
const checkStreamRequest = async (req, res, next) => {
  try {
    const { code } = req.params;
    const pending = [];

    pendingStreamRequests.forEach((val, reqId) => {
      if (val.code.toLowerCase() === code.trim().toLowerCase()) {
        pending.push({ requestId: reqId });
      }
    });

    if (pending.length > 0) {
      console.log(`[Server StreamCheck] Code '${code}' has ${pending.length} pending recipient download request(s).`);
    }

    res.json({ success: true, pendingRequests: pending });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: POST /api/files/stream-chunk/:code
 * Uploader browser sends file chunks to pipe directly to recipient HTTP stream
 */
const receiveStreamChunk = async (req, res, next) => {
  try {
    const { code } = req.params;
    const { requestId, chunkBase64, isLastChunk } = req.body;

    const streamEntry = pendingStreamRequests.get(requestId);

    if (!streamEntry) {
      console.warn(`[Server StreamChunk WARN] Received chunk for unknown or expired requestId '${requestId}'.`);
      return res.status(404).json({ success: false, message: 'Recipient download stream expired or cancelled.' });
    }

    if (chunkBase64) {
      const buffer = Buffer.from(chunkBase64, 'base64');
      streamEntry.res.write(buffer);
    }

    if (isLastChunk) {
      console.log(`[Server StreamChunk SUCCESS] Final chunk received for '${code}' (requestId: '${requestId}'). Ending response.`);
      streamEntry.res.end();
      
      // Increment download count ONLY for actual downloads (not inline previews)
      const fileRecord = streamEntry.fileRecord;
      if (fileRecord && !streamEntry.isInline) {
        fileRecord.downloadCount += 1;
        if (fileRecord.maxDownloads !== null && fileRecord.downloadCount >= fileRecord.maxDownloads) {
          fileRecord.isDeleted = true;
        }
        await fileRecord.save();
      }

      pendingStreamRequests.delete(requestId);
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: DELETE /api/files/:code
 * Early manual file deletion by uploader. Also removes the corresponding file cookie.
 */
const deleteFile = async (req, res, next) => {
  try {
    const { code } = req.params;
    const codeQuery = { $regex: new RegExp(`^${code.trim()}$`, 'i') };
    const fileRecord = await File.findOne({ code: codeQuery, isDeleted: false });

    if (!fileRecord) {
      return res.status(404).json({ success: false, message: 'File code not found.' });
    }

    // Verify ownership via uploaderToken or file_owner cookie
    const uploaderToken = req.cookies ? req.cookies.uploader_token : null;
    const fileOwnerCookie = req.cookies ? req.cookies[`file_owner_${fileRecord.code}`] : null;
    
    const isOwner = (uploaderToken && fileRecord.uploaderToken === uploaderToken) || fileOwnerCookie === fileRecord.code;

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this file.',
      });
    }

    await storageService.deleteFile(fileRecord);
    await File.deleteOne({ _id: fileRecord._id });

    // Clear file cookie at the exact same time file is removed
    clearCookieHeader(res, `file_owner_${fileRecord.code}`);

    res.json({
      success: true,
      message: `File code '${code}' successfully deleted.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller: GET /api/files/my-shared
 * Fetch files uploaded/shared by THIS user only using cookies & token
 */
const getMySharedFiles = async (req, res, next) => {
  try {
    const now = new Date();
    const uploaderToken = req.cookies ? req.cookies.uploader_token : null;
    const cookies = req.cookies || {};

    // Extract file codes from file_owner_* cookies
    const fileOwnerCodes = [];
    Object.keys(cookies).forEach((key) => {
      if (key.startsWith('file_owner_')) {
        fileOwnerCodes.push(cookies[key]);
      }
    });

    if (!uploaderToken && fileOwnerCodes.length === 0) {
      return res.json({
        success: true,
        count: 0,
        files: [],
      });
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
      expiresAt: { $gt: now },
      $or: queryConditions,
    }).sort({ createdAt: -1 });

    const activeCodesSet = new Set(activeFiles.map((f) => f.code));

    // Clear cookies for any expired or deleted files at the exact same time
    fileOwnerCodes.forEach((code) => {
      if (!activeCodesSet.has(code)) {
        clearCookieHeader(res, `file_owner_${code}`);
      }
    });

    const formatted = activeFiles.map((f) => ({
      id: f._id,
      code: f.code,
      originalName: f.originalName,
      size: f.size,
      mimeType: f.mimeType,
      storageProvider: f.storageProvider,
      createdAt: f.createdAt,
      expiresAt: f.expiresAt,
      downloadCount: f.downloadCount,
      maxDownloads: f.maxDownloads,
      isPasswordProtected: !!f.passwordHash,
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

module.exports = {
  uploadFile,
  getFileMetadata,
  downloadFile,
  deleteFile,
  getMySharedFiles,
  checkStreamRequest,
  receiveStreamChunk,
};

