const mongoose = require('mongoose');

/**
 * SystemLog Schema
 * Archives HTTP access and error logs in MongoDB collection 'systemlogs'
 */
const systemLogSchema = new mongoose.Schema(
  {
    logType: {
      type: String,
      enum: ['access', 'error'],
      required: true,
      index: true,
    },
    entries: [
      {
        timestamp: String,
        method: String,
        url: String,
        statusCode: Number,
        durationMs: Number,
        ip: String,
        userAgent: String,
        raw: String,
      },
    ],
    entryCount: {
      type: Number,
      default: 0,
    },
    archivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SystemLog', systemLogSchema);
