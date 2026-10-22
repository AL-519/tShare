const rateLimit = require('express-rate-limit');

// Rate limiter for upload endpoint: max 30 uploads per 15 minutes per IP
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many file uploads from this IP. Please wait before creating more shares.',
  },
});

// Rate limiter for file code lookups & downloads: max 120 requests per 15 minutes per IP
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many search/download attempts. Please try again in a few minutes.',
  },
});

// Strict Brute-Force Protection for password-protected files: max 15 attempts per 10 minutes per IP
const passwordBruteForceLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'too_many_password_attempts',
    message: 'Too many incorrect password attempts from this address. Please wait 10 minutes.',
  },
});

// Rate limiter for WebRTC signaling messages: max 120 messages per minute per IP
const signalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Signaling rate limit exceeded. Please wait a moment.',
  },
});

// Rate limiter for swarm heartbeats: max 60 per minute per IP
const heartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Heartbeat rate limit exceeded.',
  },
});

// Rate limiter for piece requests: max 300 per minute per IP (fast chunk streaming while preventing floods)
const pieceRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Piece transfer rate limit reached.',
  },
});

module.exports = {
  uploadLimiter,
  lookupLimiter,
  passwordBruteForceLimiter,
  signalLimiter,
  heartbeatLimiter,
  pieceRequestLimiter,
};
