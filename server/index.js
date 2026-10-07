require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./config/db');
const fileRoutes = require('./routes/fileRoutes');
const { initLogArchiverCron } = require('./jobs/logArchiverCron');
const { initCleanupCron } = require('./jobs/cleanupCron');
const errorHandler = require('./middleware/errorHandler');

const cookieParser = require('./middleware/cookieParser');
const requestLogger = require('./middleware/requestLogger');

const app = express();
const PORT = process.env.PORT || 5000;

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
    decodedUrl = rawUrl.toLowerCase();
  }

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
  ];

  const hasForbiddenPattern = forbiddenPatterns.some((pattern) => decodedUrl.includes(pattern));
  const hasPathTraversal = decodedUrl.includes('..') || decodedUrl.includes('%2e%2e');

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
  next();
});

// HTTP Request Logger Middleware
app.use(requestLogger);

// CORS Middleware (allows single-port origin + dev Vite port)
const allowedOrigin = process.env.CLIENT_ORIGIN || `http://localhost:${PORT}`;
app.use(
  cors({
    origin: [allowedOrigin, `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, 'http://localhost:5173'],
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
    service: 'TempVault Peer-to-Peer API',
    port: PORT,
    time: new Date().toISOString(),
    transferType: 'peer_to_peer',
  });
});

// API Routes
app.use('/api/files', fileRoutes);

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
        <title>TempVault — Build Required</title>
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
          <h1>⚡ TempVault Single-Port Server</h1>
          <p>The Express backend is live. To bundle the React frontend into this port, build the client from your root folder:</p>
          <p style="margin: 20px 0;"><code>npm run build</code></p>
          <p>Then refresh this page to access the full TempVault web application on <strong>http://localhost:${PORT}</strong>.</p>
        </div>
      </body>
    </html>
  `);
});

// Global Error Handler Middleware
app.use(errorHandler);

// Start HTTP Express server on the single port
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 TempVault running on http://localhost:${PORT}`);
  console.log(`🌐 Serving UI & Peer Swarm API on port ${PORT}`);
  console.log(`====================================================`);
});
