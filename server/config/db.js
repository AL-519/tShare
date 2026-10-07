const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure the private data directory exists
const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database file path (strictly isolated from client public assets)
const dbPath = process.env.SQLITE_DB_PATH || path.join(dataDir, 'tempvault.sqlite');

let db;
try {
  db = new Database(dbPath);

  // Configure SQLite performance and concurrency
  db.pragma('journal_mode = WAL'); // Write-Ahead Logging for fast concurrent reads and writes
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Initialize table schemas
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      originalName TEXT NOT NULL,
      sanitizedName TEXT,
      mimeType TEXT DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL,
      pieceSize INTEGER DEFAULT 524288,
      totalPieces INTEGER DEFAULT 1,
      storageProvider TEXT DEFAULT 'peer_to_peer',
      filePath TEXT DEFAULT 'indexeddb',
      uploaderIp TEXT DEFAULT '127.0.0.1',
      uploaderToken TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      expiresAt TEXT,
      downloadCount INTEGER DEFAULT 0,
      maxDownloads INTEGER DEFAULT NULL,
      passwordHash TEXT DEFAULT NULL,
      isDeleted INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_files_code ON files(code);
    CREATE INDEX IF NOT EXISTS idx_files_uploaderToken ON files(uploaderToken);
    CREATE INDEX IF NOT EXISTS idx_files_expiresAt ON files(expiresAt);
    CREATE INDEX IF NOT EXISTS idx_files_isDeleted ON files(isDeleted);

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logType TEXT NOT NULL,
      entryCount INTEGER DEFAULT 0,
      entriesJson TEXT,
      archivedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_system_logs_archivedAt ON system_logs(archivedAt);
  `);

  console.log(`[Database] SQLite connected successfully: ${dbPath}`);
} catch (err) {
  console.error('[Database ERROR] Failed to initialize SQLite database:', err);
  throw err;
}

module.exports = db;
