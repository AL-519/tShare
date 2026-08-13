require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const fileRoutes = require('./routes/fileRoutes');
const { initCleanupCron } = require('./jobs/cleanupCron');
const { initLogArchiverCron } = require('./jobs/logArchiverCron');
const errorHandler = require('./middleware/errorHandler');

const cookieParser = require('./middleware/cookieParser');
const requestLogger = require('./middleware/requestLogger');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB Database
connectDB();

// Initialize Node-Cron scheduled background cleanup & log archiver
initCleanupCron();
initLogArchiverCron();

// HTTP Request Logger Middleware
app.use(requestLogger);

// CORS Middleware
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(
  cors({
    origin: [allowedOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);

// Cookie Parser Middleware
app.use(cookieParser);

// Express Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Temporary File Transfer API',
    time: new Date().toISOString(),
    storageProvider: process.env.STORAGE_PROVIDER || 'local',
  });
});

// API Routes
app.use('/api/files', fileRoutes);

// Global Error Handler Middleware
app.use(errorHandler);

// Start HTTP Express server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Default Storage Provider: ${process.env.STORAGE_PROVIDER || 'local'}`);
  console.log(`⏱️ Expiry Max Limit: ${process.env.MAX_EXPIRY_HOURS || 24} hours`);
  console.log(`====================================================`);
});
