const db = require('../config/db');

/**
 * SystemLog Model
 * Archives HTTP access and error logs in SQLite table 'system_logs'
 */
class SystemLog {
  static async create({ logType, entries, entryCount, archivedAt = new Date() }) {
    const stmt = db.prepare(`
      INSERT INTO system_logs (logType, entryCount, entriesJson, archivedAt)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      logType || 'access',
      entryCount || (Array.isArray(entries) ? entries.length : 0),
      JSON.stringify(entries || []),
      archivedAt instanceof Date ? archivedAt.toISOString() : new Date().toISOString()
    );
    return { id: result.lastInsertRowid, acknowledged: true };
  }

  static async find() {
    const stmt = db.prepare('SELECT * FROM system_logs ORDER BY id DESC LIMIT 100');
    return stmt.all();
  }
}

module.exports = SystemLog;
