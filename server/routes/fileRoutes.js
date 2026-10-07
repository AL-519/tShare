const express = require('express');
const multer = require('multer');
const {
  uploadFile,
  getFileMetadata,
  deleteFile,
  getMySharedFiles,
  handleSwarmHeartbeat,
  getSwarmStatus,
  requestPiece,
  getPendingPieceRequests,
  servePiece,
} = require('../controllers/fileController');
const { uploadLimiter, lookupLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Parse form fields without buffering files in RAM (files stay in browser IndexedDB)
const uploadParser = multer();

// 1. Torrent Metadata Upload route (zero server disk & zero RAM overhead)
router.post('/upload', uploadLimiter, uploadParser.none(), uploadFile);

// 2. Torrent Swarm Coordination Endpoints
router.post('/swarm/heartbeat', handleSwarmHeartbeat);
router.get('/swarm/:code/status', getSwarmStatus);
router.post('/swarm/:code/request-piece', requestPiece);
router.get('/swarm/:code/pending-pieces', getPendingPieceRequests);
router.post('/swarm/:code/serve-piece', servePiece);

// 3. User's Own Shared Files
router.get('/my-shared', getMySharedFiles);

// 4. File Metadata Route for Download Page Display
router.get('/:code', lookupLimiter, getFileMetadata);

// 5. Delete File Route
router.delete('/:code', deleteFile);

module.exports = router;
