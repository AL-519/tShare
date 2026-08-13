const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    sanitizedName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
      default: 'application/octet-stream',
    },
    size: {
      type: Number,
      required: true, // Size in bytes
    },
    storageProvider: {
      type: String,
      enum: ['device_local', 'local', 'imagekit'],
      default: 'device_local',
      required: true,
    },
    filePath: {
      type: String,
      default: 'indexeddb',
      required: false,
    },
    imagekitFileId: {
      type: String,
      default: null,
    },
    uploaderIp: {
      type: String,
      default: '127.0.0.1',
    },
    uploaderToken: {
      type: String,
      default: null,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    maxDownloads: {
      type: Number,
      default: null, // null means unlimited within expiry window
    },
    passwordHash: {
      type: String,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Method to check if the file is expired or has hit max downloads limit
fileSchema.methods.checkIsExpired = function () {
  const now = new Date();
  if (this.isDeleted) return true;
  if (this.expiresAt && new Date(this.expiresAt) <= now) return true;
  if (this.maxDownloads !== null && this.downloadCount >= this.maxDownloads) return true;
  return false;
};

// MongoDB TTL index as backstop (document will automatically clean up after expiry)
fileSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const File = mongoose.model('File', fileSchema);

module.exports = File;
