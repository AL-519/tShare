const express = require('express');
const router = express.Router();
const lifecycleService = require('../services/lifecycleService');
const { heartbeatLimiter } = require('../middleware/rateLimiter');

// SSE stream endpoint
router.get('/stream', heartbeatLimiter, (req, res) => {
  lifecycleService.handleStream(req, res);
});

// Periodic heartbeat ping endpoint
router.post('/ping', heartbeatLimiter, (req, res) => {
  lifecycleService.handlePing(req, res);
});

router.get('/ping', heartbeatLimiter, (req, res) => {
  lifecycleService.handlePing(req, res);
});

// Tab close beacon endpoint
router.post('/close', heartbeatLimiter, (req, res) => {
  lifecycleService.handleCloseBeacon(req, res);
});

router.get('/close', heartbeatLimiter, (req, res) => {
  lifecycleService.handleCloseBeacon(req, res);
});

// Status endpoint
router.get('/status', (req, res) => {
  res.json(lifecycleService.getStatus());
});

// Explicit manual shutdown endpoint — Strictly restricted to local loopback (localhost) and same-origin
router.post('/shutdown', (req, res) => {
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLocal) {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Shutdown can only be executed directly from the host machine.',
    });
  }

  // Defend against cross-site CSRF request forged from external websites
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite === 'cross-site') {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Cross-origin shutdown requests are prohibited.',
    });
  }

  const origin = req.headers.origin;
  if (origin) {
    const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|tshare|tshare\.local)(:\d+)?$/i.test(origin);
    if (!isLocalOrigin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Invalid origin for shutdown request.',
      });
    }
  }

  res.json({ success: true, message: 'Shutting down TShare server...' });
  setTimeout(() => {
    lifecycleService.stopServer('LOCAL_HOST_REQUEST');
  }, 300);
});

module.exports = router;
