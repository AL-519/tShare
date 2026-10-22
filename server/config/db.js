const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure the private data directory exists
const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database file path (strictly isolated from client public assets)
const defaultDbPath = path.join(dataDir, 'tshare.sqlite');
const legacyDbPath = path.join(dataDir, 'tempvault.sqlite');

// Automatically migrate legacy database if it exists
if (!process.env.SQLITE_DB_PATH && fs.existsSync(legacyDbPath) && !fs.existsSync(defaultDbPath)) {
  try {
    fs.renameSync(legacyDbPath, defaultDbPath);
    if (fs.existsSync(legacyDbPath + '-wal')) fs.renameSync(legacyDbPath + '-wal', defaultDbPath + '-wal');
    if (fs.existsSync(legacyDbPath + '-shm')) fs.renameSync(legacyDbPath + '-shm', defaultDbPath + '-shm');
  } catch (e) {
    // ignore migration error and continue
  }
}

const dbPath = process.env.SQLITE_DB_PATH || defaultDbPath;

let db;
try {
  db = new Database(dbPath);

  // Configure SQLite performance and concurrency
  db.pragma('journal_mode = WAL'); // Write-Ahead Logging for fast concurrent reads and writes
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000'); // 5-second wait on lock contention before SQLITE_BUSY error

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
      creatorTokenHash TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      expiresAt TEXT,
      downloadCount INTEGER DEFAULT 0,
      maxDownloads INTEGER DEFAULT NULL,
      passwordHash TEXT DEFAULT NULL,
      fileHash TEXT DEFAULT NULL,
      isDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logType TEXT NOT NULL,
      entryCount INTEGER DEFAULT 0,
      entriesJson TEXT,
      archivedAt TEXT DEFAULT (datetime('now'))
    );
  `);

  // Safe backwards-compatible migration for existing SQLite databases
  try {
    db.exec('ALTER TABLE files ADD COLUMN fileHash TEXT DEFAULT NULL');
  } catch (_) {
    // Column already exists
  }

  try {
    db.exec('ALTER TABLE files ADD COLUMN creatorTokenHash TEXT DEFAULT NULL');
  } catch (_) {
    // Column already exists
  }

  // Create indexes after ensuring all columns exist
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_files_code ON files(code);
    CREATE INDEX IF NOT EXISTS idx_files_uploaderToken ON files(uploaderToken);
    CREATE INDEX IF NOT EXISTS idx_files_creatorTokenHash ON files(creatorTokenHash);
    CREATE INDEX IF NOT EXISTS idx_files_expiresAt ON files(expiresAt);
    CREATE INDEX IF NOT EXISTS idx_files_isDeleted ON files(isDeleted);
    CREATE INDEX IF NOT EXISTS idx_system_logs_archivedAt ON system_logs(archivedAt);
  `);

  console.log(`[Database] SQLite connected successfully: ${dbPath}`);
} catch (err) {
  console.error('[Database ERROR] Failed to initialize SQLite database:', err);
  throw err;
}

module.exports = db;
