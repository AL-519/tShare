const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const SystemLog = require('../models/SystemLog');

const LOGS_DIR = path.resolve(__dirname, '../logs');
const ACCESS_LOG_PATH = path.join(LOGS_DIR, 'access.log');
const ERROR_LOG_PATH = path.join(LOGS_DIR, 'error.log');

/**
 * Parse a log line safely
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
 * Archive log file to SQLite database asynchronously in batches and clear the file safely
 * Uses atomic rename rotation to prevent loss of incoming logs while archiving
 */
const archiveFileToDB = async (filePath, logType) => {
  try {
    if (!fs.existsSync(filePath)) return 0;

    // 1. Atomically rotate the active log file to a temporary file
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
    try {
      await fs.promises.rename(filePath, tempPath);
    } catch (renameErr) {
      // File could be empty, locked, or absent
      return 0;
    }

    // 2. Read from the isolated rotated file
    const content = await fs.promises.readFile(tempPath, 'utf-8');
    if (!content || !content.trim()) {
      await fs.promises.unlink(tempPath).catch(() => {});
      return 0;
    }

    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      await fs.promises.unlink(tempPath).catch(() => {});
      return 0;
    }

    const entries = lines.map(parseLogLine).filter(Boolean);

    // 3. Batch insert into SQLite (1,000 items per document)
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

    // 4. Safely remove rotated temp file now that it is persisted in SQLite
    await fs.promises.unlink(tempPath).catch(() => {});

    console.log(`[LogArchiver] Archived ${entries.length} ${logType} log entries to SQLite and rotated ${path.basename(filePath)}.`);
    return entries.length;
  } catch (err) {
    console.error(`[LogArchiver Error] Failed archiving ${logType} logs:`, err.message);
    return 0;
  }
};

/**
 * Perform log archival task
 */
const archiveLogsToSQLite = async () => {
  console.log(`[LogArchiver] Executing 12-hour scheduled log archival to SQLite...`);
  try {
    const accessCount = await archiveFileToDB(ACCESS_LOG_PATH, 'access');
    const errorCount = await archiveFileToDB(ERROR_LOG_PATH, 'error');
    console.log(`[LogArchiver SUCCESS] Completed 12-hour archival. Total logs saved: ${accessCount + errorCount}`);
  } catch (error) {
    console.error('[LogArchiver ERROR] Log archival failed:', error.message || error);
  }
};

// Initialize 12-hour cron job schedule
const initLogArchiverCron = () => {
  const cronSchedule = '0 */12 * * *'; // Runs every 12 hours
  console.log(`[LogArchiver Job] Scheduling log archiver with pattern: '${cronSchedule}' (Every 12 hours)`);

  cron.schedule(cronSchedule, () => {
    archiveLogsToSQLite();
  });
};

module.exports = {
  initLogArchiverCron,
  archiveLogsToSQLite,
};
