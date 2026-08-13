const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/temp_cloud';

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of hanging
    });
    console.log(`[Database] MongoDB connected successfully: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.warn(`[Database Warning] Could not connect to primary MongoDB at ${mongoUri}`);
    console.warn(`[Database Warning] Error details: ${error.message}`);
    console.warn(`[Database Warning] Note: If local MongoDB is not running, ensure MONGO_URI points to a running instance or MongoDB Atlas cluster.`);
  }
};

module.exports = connectDB;
