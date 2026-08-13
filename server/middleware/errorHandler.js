/**
 * Global Express Error Handling Middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('[Server Error]', err);

  // Multer file size limit error handling
  if (err.code === 'LIMIT_FILE_SIZE') {
    const maxMb = process.env.MAX_FILE_SIZE_MB || 200;
    return res.status(400).json({
      success: false,
      message: `File size exceeds the maximum limit of ${maxMb}MB.`,
    });
  }

  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || 'An unexpected server error occurred.',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = errorHandler;
