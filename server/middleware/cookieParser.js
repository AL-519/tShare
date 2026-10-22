/**
 * Middleware to parse HTTP Cookie headers and attach req.cookies object
 */
const cookieParser = (req, res, next) => {
  req.cookies = req.cookies || {};
  const cookieHeader = req.headers.cookie;
  
  if (cookieHeader) {
    cookieHeader.split(';').forEach((cookieStr) => {
      const parts = cookieStr.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        // Prevent Prototype Pollution via malicious cookie keys
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          return;
        }
        const rawVal = parts.slice(1).join('=').trim();
        try {
          req.cookies[key] = decodeURIComponent(rawVal);
        } catch (err) {
          req.cookies[key] = rawVal;
        }
      }
    });
  }
  
  next();
};

module.exports = cookieParser;
