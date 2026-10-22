const path = require('path');
const fs = require('fs');

// Environment Variable Resolution & Auto-Initialization
const serverEnvPath = path.resolve(__dirname, '.env');
const rootEnvPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(serverEnvPath)) {
  require('dotenv').config({ path: serverEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath });
} else {
  // If no .env exists anywhere, automatically generate a default server/.env file
  try {
    const defaultEnvContent = [
      '# TShare Server Environment Configuration',
      '# Port for the Express server to listen on (default: 21844)',
      'PORT=21844',
      '',
      '# SQLite database storage location',
      'SQLITE_DB_PATH=./data/tshare.sqlite',
      '',
      '# Allowed client origins for CORS (comma-separated; localhost and LAN are permitted by default)',
      'CLIENT_ORIGIN=http://localhost:21844',
      '',
      '# Maximum file size allowed for relay transfers in MB (default: 200)',
      'MAX_FILE_SIZE_MB=200',
      '',
      '# Automatically shut down server when all browser tabs are closed (true/false, default: true)',
      'ENABLE_AUTO_SHUTDOWN=true',
      '',
      '# Node environment (development / production)',
      'NODE_ENV=development',
      '',
    ].join('\n');

    fs.writeFileSync(serverEnvPath, defaultEnvContent, 'utf8');
    console.log('[Config] No .env file found. Automatically generated default server/.env configuration.');
    require('dotenv').config({ path: serverEnvPath });
  } catch (err) {
    console.warn('[Config] Could not auto-generate server/.env file. Using built-in default values.', err.message);
  }
}

const express = require('express');
const cors = require('cors');
const os = require('os');
const db = require('./config/db');
const fileRoutes = require('./routes/fileRoutes');
const lifecycleRoutes = require('./routes/lifecycleRoutes');
const lifecycleService = require('./services/lifecycleService');
const discoveryService = require('./services/discoveryService');
const { initLogArchiverCron } = require('./jobs/logArchiverCron');
const { initCleanupCron } = require('./jobs/cleanupCron');
const errorHandler = require('./middleware/errorHandler');

const cookieParser = require('./middleware/cookieParser');
const requestLogger = require('./middleware/requestLogger');

const app = express();
const PORT = process.env.PORT || 21844;

// Initialize background cron jobs
initLogArchiverCron();
initCleanupCron();

// Ironclad Data Protection Middleware: Strictly blocks direct access to SQLite database & private server files
app.use((req, res, next) => {
  const rawUrl = req.url || '';
  let decodedUrl = '';
  try {
    decodedUrl = decodeURIComponent(rawUrl).toLowerCase();
  } catch (e) {
    return res.status(400).json({
      success: false,
      message: 'Bad Request: Malformed URI encoding.',
    });
  }

  // Reject null bytes (%00 / \0)
  if (rawUrl.includes('\0') || decodedUrl.includes('\0') || rawUrl.includes('%00')) {
    return res.status(400).json({
      success: false,
      message: 'Bad Request: Null byte detected in URL.',
    });
  }

  const normalizedPath = path.posix.normalize(decodedUrl);

  const forbiddenPatterns = [
    '.sqlite',
    '.db',
    '.sql',
    '/data/',
    '\\data\\',
    '/server/',
    '\\server\\',
    '.env',
    'node_modules',
    'package.json',
    'package-lock.json',
    '.git',
    '.gitignore',
    '.vscode',
    'audit_report.md',
    'readme.md',
    '/logs/',
    '\\logs\\',
    '/uploads/',
    '\\uploads\\',
  ];

  const hasForbiddenPattern = forbiddenPatterns.some((pattern) => normalizedPath.includes(pattern));
  const hasPathTraversal = normalizedPath.includes('..') || rawUrl.includes('..') || rawUrl.includes('%2e%2e');

  if (hasForbiddenPattern || hasPathTraversal) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Direct access to server database and private data files is strictly prohibited.',
    });
  }

  next();
});

// Production Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // Content Security Policy allowing local assets, WebRTC STUN/TURN, and data blobs for Web Workers
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self' data:; " +
    "img-src 'self' data: blob: *; " +
    "connect-src 'self' ws: wss: http: https: blob:; " +
    "worker-src 'self' blob:; " +
    "object-src 'none';"
  );
  next();
});

// HTTP Request Logger Middleware
app.use(requestLogger);

// Helper to retrieve local network IPv4 addresses for LAN sharing
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Trusted origin validator for CORS protection
const isTrustedOrigin = (origin) => {
  if (!origin) return true; // Same-origin, mobile webviews, curl, local scripts

  // Localhost, LAN IPv4, or local mDNS / LLMNR hostnames
  const isLanOrLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|tshare|tshare\.local)(:\d+)?$/i.test(origin);
  if (isLanOrLocal) return true;

  // Explicit deployed origin(s) configured in environment variables (supports comma-separated list)
  if (process.env.CLIENT_ORIGIN) {
    const configuredOrigins = process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim().replace(/\/+$/, ''));
    if (configuredOrigins.includes(origin.replace(/\/+$/, ''))) {
      return true;
    }
  }

  return false;
};

// CORS Middleware (Strictly restricted to localhost, LAN peers, and configured deployed origins)
app.use(
  cors({
    origin: (origin, callback) => {
      if (isTrustedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS access denied: Untrusted origin '${origin}'.`));
    },
    credentials: true,
  })
);

// Cookie Parser Middleware
app.use(cookieParser);

// Express Body Parsers
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Path to client production static assets
const clientDistPath = path.resolve(__dirname, '../client/dist');

// Serve static assets from client build directory
app.use(express.static(clientDistPath));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TShare Peer-to-Peer API',
    port: PORT,
    localIps: getLocalIpAddresses(),
    time: new Date().toISOString(),
    transferType: 'peer_to_peer',
  });
});

// API Routes
app.use('/api/files', fileRoutes);
app.use('/api/lifecycle', lifecycleRoutes);

// Catch-all route to serve client index.html for SPA React Router navigation
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(clientDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>TShare — Build Required</title>
        <style>
          body { background: #080c14; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; padding: 20px; }
          .card { background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 24px; padding: 40px; max-width: 480px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); backdrop-filter: blur(16px); }
          h1 { color: #818cf8; font-size: 24px; margin-top: 0; margin-bottom: 12px; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 8px 0; }
          code { background: #1e293b; color: #38bdf8; padding: 4px 10px; border-radius: 8px; font-family: monospace; font-size: 13px; font-weight: bold; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; background: rgba(16, 185, 129, 0.15); color: #34d399; font-size: 11px; font-weight: bold; margin-bottom: 16px; border: 1px solid rgba(16, 185, 129, 0.3); }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">Backend Active on Port ${PORT}</span>
          <h1>⚡ TShare Single-Port Server</h1>
          <p>The Express backend is live. To bundle the React frontend into this port, build the client from your root folder:</p>
          <p style="margin: 20px 0;"><code>npm run build</code></p>
          <p>Then refresh this page to access the full TShare web application on <strong>http://localhost:${PORT}</strong>.</p>
        </div>
      </body>
    </html>
  `);
});

// Global Error Handler Middleware
app.use(errorHandler);

// Start HTTP Express server on 0.0.0.0 (all network interfaces)
const server = app.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIpAddresses();
  console.log(`====================================================`);
  console.log(`🚀 TShare running on:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  if (localIps.length > 0) {
    localIps.forEach((ip) => {
      console.log(`   Network: http://${ip}:${PORT}`);
    });
    console.log(`🌐 Devices on the same Wi-Fi / IP can connect to:`);
    console.log(`   http://${localIps[0]}:${PORT}`);
  }
  console.log(`🔍 Other devices on Wi-Fi can search:`);
  console.log(`   http://tshare.local:${PORT} or http://tshare:${PORT}`);
  console.log(`💡 Application will auto-stop and free port when webpage closes`);
  console.log(`====================================================`);

  // Initialize lifecycle auto-shutdown manager
  lifecycleService.init(server, db, PORT);

  // Initialize mDNS & LLMNR Wi-Fi name discovery for 'tshare'
  discoveryService.init(PORT, app);
});

// Graceful process shutdown handling (flushes connections & closes SQLite WAL database)
const gracefulShutdown = (signal) => {
  console.log(`\n[Server] Received ${signal}. Closing HTTP server and SQLite database gracefully...`);
  discoveryService.close();
  lifecycleService.stopServer(signal);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Process resilience: prevent unhandled errors from terminating Node unexpectedly
process.on('uncaughtException', (err) => {
  console.error('[Process UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process UNHANDLED REJECTION]', reason);
});
