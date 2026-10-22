const fs = require('fs');
const path = require('path');

// Local upload directory path fallback (for backwards-compatible legacy file cleanup)
const defaultUploadDir = path.resolve(__dirname, '../uploads');
const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR
  ? path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR)
  : defaultUploadDir;

/**
 * Delete a stored file (safely cleans legacy disk uploads if any, zero server disk usage for P2P transfers)
 * @param {Object} fileRecord 
 */
async function deleteFile(fileRecord) {
  if (!fileRecord) return;

  try {
    if (fileRecord.storageProvider === 'local' && fileRecord.filePath) {
      // Strictly prevent path traversal: Verify path resolves within UPLOAD_DIR
      const resolvedTarget = path.resolve(fileRecord.filePath);
      const isSafePath = resolvedTarget.startsWith(path.resolve(UPLOAD_DIR));
      if (isSafePath && fs.existsSync(resolvedTarget)) {
        await fs.promises.unlink(resolvedTarget);
        console.log(`[Storage] Deleted legacy local file at ${resolvedTarget}.`);
      } else if (!isSafePath) {
        console.warn(`[Storage Warning] Refusing to delete file outside upload directory: ${resolvedTarget}`);
      }
    } else if (fileRecord.storageProvider === 'device_local' || fileRecord.storageProvider === 'peer_to_peer') {
      console.log(`[Storage] P2P / Device local file record (${fileRecord.code}) removed from DB. Zero server disk usage.`);
    }
  } catch (error) {
    console.error(`[Storage Error] Failed to delete file (${fileRecord.code}):`, error.message);
  }
}

module.exports = {
  deleteFile,
  UPLOAD_DIR,
};
