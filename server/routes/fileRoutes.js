const express = require('express');
const multer = require('multer');
const {
  uploadFile,
  getFileMetadata,
  downloadFile,
  deleteFile,
  getMySharedFiles,
  checkStreamRequest,
  receiveStreamChunk,
} = require('../controllers/fileController');
const { uploadLimiter, lookupLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Configure multer memory storage so file buffer is available for Local or ImageKit upload
const maxFileSizeMb = parseInt(process.env.MAX_FILE_SIZE_MB || '200', 10);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024, // MB to bytes
  },
});

// Upload route
router.post('/upload', uploadLimiter, upload.single('file'), uploadFile);

// Stream relay endpoints for device-local storage peer transfer
router.get('/stream-check/:code', checkStreamRequest);
router.post('/stream-chunk/:code', receiveStreamChunk);

// User's own shared files route
router.get('/my-shared', getMySharedFiles);

// File metadata route for download page
router.get('/:code', lookupLimiter, getFileMetadata);

// File download stream/redirect route
router.get('/:code/download', lookupLimiter, downloadFile);

// Delete file route
router.delete('/:code', deleteFile);

module.exports = router;
