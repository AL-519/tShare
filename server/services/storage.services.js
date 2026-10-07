const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Singleton ImageKit instance handle
let cachedImageKit = null;

/**
 * Get or initialize ImageKit SDK instance on demand
 */
function getImageKitInstance() {
  if (cachedImageKit) {
    return cachedImageKit;
  }

  const privateKey = (process.env.IMAGEKIT_PRIVATE_KEY || '').trim();
  if (!privateKey) {
    throw new Error('ImageKit is not configured. Please set IMAGEKIT_PRIVATE_KEY in your server/.env file.');
  }

  let ImageKitSDK;
  try {
    ImageKitSDK = require('imagekit');
  } catch (e1) {
    try {
      const ikModule = require('@imagekit/nodejs');
      ImageKitSDK = ikModule.default || ikModule;
    } catch (e2) {
      throw new Error('ImageKit SDK package ("imagekit") is not installed. Please run `npm install imagekit`.');
    }
  }

  // Fallback placeholders for optional publicKey and urlEndpoint so constructor succeeds
  const publicKey = (process.env.IMAGEKIT_PUBLIC_KEY || 'public_default').trim();
  const urlEndpoint = (process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/default').trim();

  cachedImageKit = new ImageKitSDK({
    privateKey,
    publicKey,
    urlEndpoint,
  });

  return cachedImageKit;
}

// Local upload directory path
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR || './uploads');

// Ensure local upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Upload buffer to ImageKit (with optional folder support)
 * @param {Buffer} buffer 
 * @param {string} fileName 
 * @param {string} [customFolder]
 */
async function uploadToImageKit(buffer, fileName, customFolder) {
  const imagekit = getImageKitInstance();
  const base64File = buffer.toString('base64');
  
  const uploadPayload = {
    file: base64File,
    fileName: fileName || 'file_' + Date.now(),
  };

  // ImageKit target folder support
  const targetFolder = customFolder || process.env.IMAGEKIT_FOLDER_NAME || process.env.IMAGEKIT_FOLDER_PATH;
  if (targetFolder) {
    uploadPayload.folder = targetFolder.startsWith('/') ? targetFolder : '/' + targetFolder;
  }

  // Promisified upload supporting both Promise return and callback signature
  const result = await new Promise((resolve, reject) => {
    const uploadFn = (imagekit.files && typeof imagekit.files.upload === 'function')
      ? imagekit.files.upload.bind(imagekit.files)
      : (imagekit.upload ? imagekit.upload.bind(imagekit) : null);

    if (!uploadFn) {
      return reject(new Error('ImageKit upload method not found on SDK instance.'));
    }

    const res = uploadFn(uploadPayload, (err, resData) => {
      if (err) return reject(err);
      resolve(resData);
    });

    if (res && typeof res.then === 'function') {
      res.then(resolve).catch(reject);
    }
  });

  const resolvedFileId = result.fileId || result.file_id;
  console.log(`[Storage] Successfully uploaded to ImageKit. fileId: ${resolvedFileId}`);

  return {
    url: result.url,
    fileId: resolvedFileId,
  };
}

/**
 * Promisified helper to delete a file from ImageKit by fileId
 * @param {string} fileId 
 */
function deleteFromImageKit(fileId) {
  return new Promise((resolve, reject) => {
    try {
      const imagekit = getImageKitInstance();
      
      const deleteFn = (imagekit.files && typeof imagekit.files.deleteFile === 'function')
        ? imagekit.files.deleteFile.bind(imagekit.files)
        : (imagekit.deleteFile ? imagekit.deleteFile.bind(imagekit) : null);

      if (!deleteFn) {
        return reject(new Error('ImageKit deleteFile method not found on SDK instance.'));
      }

      // Execute delete with node callback signature
      const res = deleteFn(fileId, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });

      // Catch native Promise return if supported
      if (res && typeof res.then === 'function') {
        res.then(resolve).catch(reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Save file locally on disk
 * @param {Buffer} buffer 
 * @param {string} fileName 
 */
async function uploadToLocal(buffer, fileName) {
  const safeName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${path.basename(fileName)}`;
  const destinationPath = path.join(UPLOAD_DIR, safeName);
  
  await fs.promises.writeFile(destinationPath, buffer);
  
  return {
    filePath: destinationPath,
    relativePath: safeName,
  };
}

/**
 * Unified Upload Handler
 * @param {Object} params
 * @param {Buffer} [params.buffer]
 * @param {string} params.originalName
 * @param {string} params.provider - 'device_local' | 'imagekit' | 'local'
 */
async function saveFile({ buffer, originalName, provider = 'device_local' }) {
  if (provider === 'imagekit' && buffer) {
    const ikResult = await uploadToImageKit(buffer, originalName);
    return {
      storageProvider: 'imagekit',
      filePath: ikResult.url,
      imagekitFileId: ikResult.fileId,
    };
  } else if (provider === 'local' && buffer) {
    const localResult = await uploadToLocal(buffer, originalName);
    return {
      storageProvider: 'local',
      filePath: localResult.filePath,
      imagekitFileId: null,
    };
  } else {
    // 'device_local': User device IndexedDB storage (0 server disk usage)
    return {
      storageProvider: 'device_local',
      filePath: 'indexeddb',
      imagekitFileId: null,
    };
  }
}

/**
 * Delete a stored file (from local disk or ImageKit)
 * @param {Object} fileRecord 
 */
async function deleteFile(fileRecord) {
  if (!fileRecord) return;

  try {
    if (fileRecord.storageProvider === 'imagekit' && fileRecord.imagekitFileId) {
      await deleteFromImageKit(fileRecord.imagekitFileId);
      console.log(`[Storage] Successfully deleted file ${fileRecord.imagekitFileId} from ImageKit.`);
    } else if (fileRecord.storageProvider === 'local' && fileRecord.filePath && fs.existsSync(fileRecord.filePath)) {
      // Delete from local filesystem if legacy local file exists
      await fs.promises.unlink(fileRecord.filePath);
      console.log(`[Storage] Deleted legacy local file at ${fileRecord.filePath}.`);
    } else if (fileRecord.storageProvider === 'device_local' || fileRecord.storageProvider === 'peer_to_peer') {
      console.log(`[Storage] P2P / Device local file record (${fileRecord.code}) removed from DB. Zero server disk usage.`);
    }
  } catch (error) {
    console.error(`[Storage Error] Failed to delete file (${fileRecord.code}):`, error.message);
  }
}

module.exports = {
  getImageKitInstance,
  uploadToImageKit,
  deleteFromImageKit,
  uploadToLocal,
  saveFile,
  deleteFile,
  UPLOAD_DIR,
};
