const express = require('express');
const multer = require('multer');
const {
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
} = require('../controllers/fileController');
const {
  uploadLimiter,
  lookupLimiter,
  passwordBruteForceLimiter,
  signalLimiter,
  heartbeatLimiter,
  pieceRequestLimiter,
} = require('../middleware/rateLimiter');

const router = express.Router();

// Parse form fields without buffering files in RAM (files stay in browser IndexedDB)
const uploadParser = multer({
  limits: {
    fieldSize: 10 * 1024 * 1024, // 10MB max form field (for piece base64 or metadata)
    fields: 20,
  },
});

// 1. Torrent Metadata Upload route (zero server disk & zero RAM overhead)
router.post('/upload', uploadLimiter, uploadParser.none(), uploadFile);

// 2. Torrent Swarm & WebRTC Signaling Coordination Endpoints (Protected by Rate Limiters)
router.post('/swarm/heartbeat', heartbeatLimiter, handleSwarmHeartbeat);
router.get('/swarm/:code/status', lookupLimiter, getSwarmStatus);
router.post('/swarm/:code/signal', signalLimiter, sendSwarmSignal);
router.get('/swarm/:code/signals', signalLimiter, getSwarmSignals);
router.post('/swarm/:code/complete', lookupLimiter, recordDownloadComplete);
router.post('/swarm/:code/request-piece', pieceRequestLimiter, passwordBruteForceLimiter, requestPiece);
router.get('/swarm/:code/pending-pieces', pieceRequestLimiter, getPendingPieceRequests);
router.post('/swarm/:code/serve-piece', pieceRequestLimiter, servePiece);

// 3. User's Own Shared Files
router.get('/my-shared', lookupLimiter, getMySharedFiles);

// 4. File Metadata Route for Download Page Display
router.get('/:code', lookupLimiter, getFileMetadata);

// 5. Password-Protected Folder Unlock Route (Strict Brute-Force Rate Limiting)
router.post('/:code/unlock', passwordBruteForceLimiter, unlockFile);

// 6. Delete File Route (Protected by Cryptographic Creator Token verification)
router.delete('/:code', lookupLimiter, deleteFile);

module.exports = router;
