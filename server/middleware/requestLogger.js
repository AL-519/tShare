const fs = require('fs');
const path = require('path');

// Ensure server/logs directory exists
const LOGS_DIR = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// File write streams for access and error logs
const accessLogStream = fs.createWriteStream(path.join(LOGS_DIR, 'access.log'), { flags: 'a' });
const errorLogStream = fs.createWriteStream(path.join(LOGS_DIR, 'error.log'), { flags: 'a' });

/**
 * Custom Request Logger Middleware
 * Formats: [TIMESTAMP] METHOD URL STATUS DURATION_MS - IP USER_AGENT
 */
const requestLogger = (req, res, next) => {
  // Skip verbose polling requests to keep log files readable
  if (req.originalUrl && req.originalUrl.includes('/stream-check/')) {
    return next();
  }

  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown-Agent';

  // Hook into response finish event to capture final status code & duration
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const logLine = `[${timestamp}] ${req.method} ${req.originalUrl || req.url} ${statusCode} ${duration}ms - ${clientIp} "${userAgent}"\n`;

    // Console output for development visibility
    console.log(`[HTTP] ${req.method} ${req.originalUrl || req.url} ${statusCode} (${duration}ms)`);

    // Append to access.log
    accessLogStream.write(logLine);

    // Append to error.log for 4xx and 5xx response statuses
    if (statusCode >= 400) {
      errorLogStream.write(logLine);
    }
  });

  next();
};

module.exports = requestLogger;
