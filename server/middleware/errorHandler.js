/**
 * Global Express Error Handling Middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('[Server Error]', err);

  // Catch malformed JSON body parser SyntaxError
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'invalid_json',
      message: 'Malformed JSON payload provided in request body.',
    });
  }

  // Multer file size limit error handling
  if (err.code === 'LIMIT_FILE_SIZE') {
    const maxMb = process.env.MAX_FILE_SIZE_MB || 200;
    return res.status(400).json({
      success: false,
      error: 'limit_file_size',
      message: `File size exceeds the maximum limit of ${maxMb}MB.`,
    });
  }

  // Safe status code resolution
  const statusCode = (err.status || err.statusCode) || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  res.status(statusCode).json({
    success: false,
    error: err.code || (statusCode === 404 ? 'not_found' : 'server_error'),
    message: err.message || 'An unexpected server error occurred.',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = errorHandler;
