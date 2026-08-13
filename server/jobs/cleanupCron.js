const cron = require('node-cron');
const File = require('../models/File');
const storageService = require('../services/storage.services');

/**
 * Cleanup Service:
 * Finds expired files in MongoDB or files marked as deleted/exhausted.
 * Deletes the physical file (from local uploads directory or ImageKit CDN)
 * and then purges the database record.
 */
const performCleanupSweep = async () => {
  const now = new Date();
  console.log(`[Cron Cleanup] Running scheduled file cleanup sweep at ${now.toISOString()}`);

  try {
    // 1. Find files where expiresAt is past, or download count reached max limit, or isDeleted flag is set
    const expiredFiles = await File.find({
      $or: [
        { expiresAt: { $lte: now } },
        { isDeleted: true },
        {
          $and: [
            { maxDownloads: { $ne: null } },
            { $expr: { $gte: ['$downloadCount', '$maxDownloads'] } },
          ],
        },
      ],
    });

    if (expiredFiles.length === 0) {
      console.log('[Cron Cleanup] No expired files found.');
      return;
    }

    console.log(`[Cron Cleanup] Found ${expiredFiles.length} file(s) eligible for permanent deletion.`);

    // 2. Iterate through expired files and delete physical assets & DB documents
    for (const fileRecord of expiredFiles) {
      try {
        // Delete physical file from storage (Local disk or ImageKit)
        await storageService.deleteFile(fileRecord);

        // Remove document from MongoDB database
        await File.deleteOne({ _id: fileRecord._id });
        console.log(`[Cron Cleanup] Successfully purged record for code: ${fileRecord.code}`);
      } catch (err) {
        console.error(`[Cron Cleanup Error] Failed to purge file record ${fileRecord.code}:`, err.message);
      }
    }

    console.log('[Cron Cleanup] Expiry sweep completed.');
  } catch (error) {
    console.error('[Cron Cleanup Error] Error executing cleanup cron job:', error.message);
  }
};

/**
 * Initialize node-cron schedule
 * Default schedule: Every 5 minutes ('* /5 * * * *')
 */
const initCleanupCron = () => {
  // Cron schedule string: Every 5 minutes
  const cronSchedule = '*/5 * * * *';

  console.log(`[Cron Job] Scheduling file cleanup task with pattern: '${cronSchedule}'`);
  
  cron.schedule(cronSchedule, () => {
    performCleanupSweep();
  });

  // Also run immediate sweep on startup to catch files expired while server was offline
  performCleanupSweep();
};

module.exports = {
  initCleanupCron,
  performCleanupSweep,
};
