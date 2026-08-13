const rateLimit = require('express-rate-limit');

// Rate limiter for upload endpoint: max 30 uploads per 15 minutes per IP
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many file uploads from this IP. Please try again after 15 minutes.',
  },
});

// Rate limiter for file code lookups & downloads: max 100 requests per 15 minutes per IP
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many search/download attempts. Please try again later.',
  },
});

module.exports = {
  uploadLimiter,
  lookupLimiter,
};
