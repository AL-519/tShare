const db = require('../config/db');

/**
 * FileRecord represents a single file metadata row in the SQLite database
 */
class FileRecord {
  constructor(row) {
    this.id = row.id;
    this._id = row.id; // Compatibility alias for callers accessing either id or _id
    this.code = (row.code || '').trim().toUpperCase();
    this.originalName = row.originalName;
    this.sanitizedName = row.sanitizedName || row.originalName;
    this.mimeType = row.mimeType || 'application/octet-stream';
    this.size = Number(row.size) || 0;
    this.pieceSize = Number(row.pieceSize) || 512 * 1024;
    this.totalPieces = Number(row.totalPieces) || 1;
    this.storageProvider = row.storageProvider || 'peer_to_peer';
    this.filePath = row.filePath || 'indexeddb';
    this.uploaderIp = row.uploaderIp || '127.0.0.1';
    this.uploaderToken = row.uploaderToken || null;
    this.createdAt = row.createdAt ? new Date(row.createdAt) : new Date();
    this.expiresAt = row.expiresAt ? new Date(row.expiresAt) : null;
    this.downloadCount = Number(row.downloadCount) || 0;
    this.maxDownloads = row.maxDownloads !== null && row.maxDownloads !== undefined ? Number(row.maxDownloads) : null;
    this.passwordHash = row.passwordHash || null;
    this.isDeleted = Boolean(row.isDeleted);
  }

  /**
   * Check if file link has expired
   */
  checkIsExpired() {
    const now = new Date();
    if (this.isDeleted) return true;
    if (this.expiresAt && new Date(this.expiresAt) <= now) return true;
    return false;
  }

  /**
   * Atomically increment download count in SQLite database
   */
  async incrementDownload() {
    this.downloadCount += 1;
    const stmt = db.prepare('UPDATE files SET downloadCount = downloadCount + 1 WHERE id = ?');
    stmt.run(this.id);
    return this;
  }

  /**
   * Insert new record or update existing row in SQLite database
   */
  async save() {
    if (this.id) {
      const stmt = db.prepare(`
        UPDATE files SET
          originalName = ?,
          sanitizedName = ?,
          mimeType = ?,
          size = ?,
          pieceSize = ?,
          totalPieces = ?,
          storageProvider = ?,
          filePath = ?,
          uploaderIp = ?,
          uploaderToken = ?,
          expiresAt = ?,
          downloadCount = ?,
          maxDownloads = ?,
          passwordHash = ?,
          isDeleted = ?
        WHERE id = ?
      `);
      stmt.run(
        this.originalName,
        this.sanitizedName,
        this.mimeType,
        this.size,
        this.pieceSize,
        this.totalPieces,
        this.storageProvider,
        this.filePath,
        this.uploaderIp,
        this.uploaderToken,
        this.expiresAt ? this.expiresAt.toISOString() : null,
        this.downloadCount,
        this.maxDownloads,
        this.passwordHash,
        this.isDeleted ? 1 : 0,
        this.id
      );
      return this;
    } else {
      const stmt = db.prepare(`
        INSERT INTO files (
          code, originalName, sanitizedName, mimeType, size,
          pieceSize, totalPieces, storageProvider, filePath,
          uploaderIp, uploaderToken, createdAt, expiresAt,
          downloadCount, maxDownloads, passwordHash, isDeleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        this.code,
        this.originalName,
        this.sanitizedName,
        this.mimeType,
        this.size,
        this.pieceSize,
        this.totalPieces,
        this.storageProvider,
        this.filePath,
        this.uploaderIp,
        this.uploaderToken,
        this.createdAt ? this.createdAt.toISOString() : new Date().toISOString(),
        this.expiresAt ? this.expiresAt.toISOString() : null,
        this.downloadCount,
        this.maxDownloads,
        this.passwordHash,
        this.isDeleted ? 1 : 0
      );
      this.id = result.lastInsertRowid;
      this._id = this.id;
      return this;
    }
  }
}

/**
 * File Model (SQLite Data Access Object)
 */
class File {
  constructor(data) {
    return new FileRecord(data);
  }

  /**
   * Find single file record by query parameters
   */
  static async findOne(query = {}) {
    const conditions = [];
    const params = [];

    if (query.code !== undefined) {
      conditions.push('UPPER(code) = ?');
      params.push(String(query.code).trim().toUpperCase());
    }
    if (query.isDeleted !== undefined) {
      conditions.push('isDeleted = ?');
      params.push(query.isDeleted ? 1 : 0);
    }
    if (query.uploaderToken !== undefined) {
      conditions.push('uploaderToken = ?');
      params.push(query.uploaderToken);
    }
    if (query._id !== undefined || query.id !== undefined) {
      conditions.push('id = ?');
      params.push(query._id || query.id);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = db.prepare(`SELECT * FROM files ${whereSql} LIMIT 1`);
    const row = stmt.get(...params);
    return row ? new FileRecord(row) : null;
  }

  /**
   * Find multiple file records supporting sort and complex conditions
   */
  static find(query = {}) {
    let sortSql = 'ORDER BY id DESC';

    const execute = () => {
      const nowIso = new Date().toISOString();
      let whereParts = [];
      const params = [];

      // Check isDeleted condition
      if (query.isDeleted !== undefined) {
        whereParts.push('isDeleted = ?');
        params.push(query.isDeleted ? 1 : 0);
      }

      // Handle multi-condition $or / $and query structures used in getMySharedFiles and cleanup
      if (query.$or) {
        const isCleanupQuery = query.$or.some(
          (c) => c.isDeleted === true || (c.expiresAt && c.expiresAt.$lte)
        );

        if (isCleanupQuery) {
          whereParts = [
            `(
              (expiresAt IS NOT NULL AND datetime(expiresAt) <= datetime(?)) OR
              isDeleted = 1
            )`,
          ];
          params.push(nowIso);
        } else {
          whereParts.push(`(expiresAt IS NULL OR datetime(expiresAt) > datetime(?))`);
          params.push(nowIso);
        }
      }

      // Handle $and with nested $or (e.g. uploaderToken OR code $in)
      if (query.$and && Array.isArray(query.$and)) {
        for (const andItem of query.$and) {
          if (andItem.$or && Array.isArray(andItem.$or)) {
            const orConditions = [];
            for (const cond of andItem.$or) {
              if (cond.uploaderToken) {
                orConditions.push('uploaderToken = ?');
                params.push(cond.uploaderToken);
              }
              if (cond.code && cond.code.$in && Array.isArray(cond.code.$in) && cond.code.$in.length > 0) {
                const placeholders = cond.code.$in.map(() => '?').join(',');
                orConditions.push(`UPPER(code) IN (${placeholders})`);
                params.push(...cond.code.$in.map((c) => String(c).trim().toUpperCase()));
              }
            }
            if (orConditions.length > 0) {
              whereParts.push(`(${orConditions.join(' OR ')})`);
            }
          }
        }
      }

      // Simple direct field queries
      if (query.code) {
        whereParts.push('UPPER(code) = ?');
        params.push(String(query.code).trim().toUpperCase());
      }
      if (query.uploaderToken) {
        whereParts.push('uploaderToken = ?');
        params.push(query.uploaderToken);
      }

      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
      const stmt = db.prepare(`SELECT * FROM files ${whereClause} ${sortSql}`);
      const rows = stmt.all(...params);
      return rows.map((r) => new FileRecord(r));
    };

    // Return a chainable Promise supporting .sort()
    const promise = Promise.resolve().then(() => execute());
    promise.sort = (sortObj) => {
      if (sortObj && sortObj.createdAt === -1) {
        sortSql = 'ORDER BY datetime(createdAt) DESC, id DESC';
      } else if (sortObj && sortObj.createdAt === 1) {
        sortSql = 'ORDER BY datetime(createdAt) ASC, id ASC';
      }
      return Promise.resolve().then(() => execute());
    };

    return promise;
  }

  /**
   * Delete record by id or code
   */
  static async deleteOne(query = {}) {
    if (query._id || query.id) {
      const stmt = db.prepare('DELETE FROM files WHERE id = ?');
      const result = stmt.run(query._id || query.id);
      return { acknowledged: true, deletedCount: result.changes };
    }
    if (query.code) {
      const stmt = db.prepare('DELETE FROM files WHERE UPPER(code) = ?');
      const result = stmt.run(String(query.code).trim().toUpperCase());
      return { acknowledged: true, deletedCount: result.changes };
    }
    return { acknowledged: false, deletedCount: 0 };
  }

  /**
   * Create and persist a new File record
   */
  static async create(data) {
    const record = new FileRecord(data);
    await record.save();
    return record;
  }
}

module.exports = File;
