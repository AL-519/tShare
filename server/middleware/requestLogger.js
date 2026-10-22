const fs = require('fs');
const path = require('path');

// Ensure server/logs directory exists
const LOGS_DIR = path.resolve(__dirname, '../logs');
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
  // Skip high-frequency swarm heartbeat, pieces, and signaling to conserve CPU and avoid disk write thrashing
  if (
    req.originalUrl &&
    (req.originalUrl.includes('/stream-check/') ||
     req.originalUrl.includes('/swarm/') ||
     req.originalUrl.includes('/lifecycle/stream') ||
     req.originalUrl.includes('/lifecycle/ping'))
  ) {
    return next();
  }

  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const rawIp = req.ip || req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
  const clientIp = String(rawIp).replace(/[\r\n]/g, '').slice(0, 45);
  const userAgent = String(req.headers['user-agent'] || 'Unknown-Agent').replace(/[\r\n]/g, '').slice(0, 200);
  const targetPath = String(req.originalUrl || req.url || '').replace(/[\r\n]/g, '').slice(0, 500);

  // Hook into response finish event to capture final status code & duration
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const logLine = `[${timestamp}] ${req.method} ${targetPath} ${statusCode} ${duration}ms - ${clientIp} "${userAgent}"\n`;

    // Console output for development visibility
    console.log(`[HTTP] ${req.method} ${targetPath} ${statusCode} (${duration}ms)`);

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
