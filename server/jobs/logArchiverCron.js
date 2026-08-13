const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const SystemLog = require('../models/SystemLog');

const LOGS_DIR = path.resolve(process.cwd(), 'logs');
const ACCESS_LOG_PATH = path.join(LOGS_DIR, 'access.log');
const ERROR_LOG_PATH = path.join(LOGS_DIR, 'error.log');

/**
 * Parse a log line formatted as:
 * [2026-08-13T10:47:52.895Z] POST /api/files/stream-chunk/XmaBeX 500 4ms - ::1 "Mozilla/5.0 ..."
 */
const parseLogLine = (line) => {
  if (!line || !line.trim()) return null;
  const regex = /^\[(.*?)\]\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)ms\s+-\s+(\S+)\s+"(.*)"$/;
  const match = line.trim().match(regex);
  if (match) {
    return {
      timestamp: match[1],
      method: match[2],
      url: match[3],
      statusCode: parseInt(match[4], 10),
      durationMs: parseInt(match[5], 10),
      ip: match[6],
      userAgent: match[7],
      raw: line.trim(),
    };
  }
  return {
    raw: line.trim(),
  };
};

/**
 * Archive log file to MongoDB in batches and clear the file safely
 */
const archiveFileToDB = async (filePath, logType) => {
  if (!fs.existsSync(filePath)) return 0;

  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content || !content.trim()) return 0;

  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return 0;

  const entries = lines.map(parseLogLine).filter(Boolean);

  // Batch insert into MongoDB (1,000 items per document) to stay well under MongoDB 16MB document limit
  const BATCH_SIZE = 1000;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    await SystemLog.create({
      logType,
      entries: chunk,
      entryCount: chunk.length,
      archivedAt: new Date(),
    });
  }

  // Safely truncate file to 0 bytes without destroying file stream handles
  try {
    fs.truncateSync(filePath, 0);
  } catch (err) {
    fs.writeFileSync(filePath, '', 'utf-8');
  }

  console.log(`[LogArchiver] Archived ${entries.length} ${logType} log entries to MongoDB and cleared ${path.basename(filePath)}.`);

  return entries.length;
};

/**
 * Perform log archival task
 */
const archiveLogsToMongoDB = async () => {
  console.log(`[LogArchiver] Executing 12-hour scheduled log archival to MongoDB...`);
  try {
    const accessCount = await archiveFileToDB(ACCESS_LOG_PATH, 'access');
    const errorCount = await archiveFileToDB(ERROR_LOG_PATH, 'error');
    console.log(`[LogArchiver SUCCESS] Completed 12-hour archival. Total logs saved: ${accessCount + errorCount}`);
  } catch (error) {
    console.error('[LogArchiver ERROR] Log archival failed:', error.message || error);
  }
};

// Initialize 12-hour cron job schedule
// Schedule: '0 */12 * * *' (Every 12 hours)
const initLogArchiverCron = () => {
  const cronSchedule = '0 */12 * * *'; // Runs every 12 hours
  console.log(`[LogArchiver Job] Scheduling log archiver with pattern: '${cronSchedule}' (Every 12 hours)`);

  cron.schedule(cronSchedule, () => {
    archiveLogsToMongoDB();
  });
};

module.exports = {
  initLogArchiverCron,
  archiveLogsToMongoDB,
};
