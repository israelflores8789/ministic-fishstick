import { Database } from 'bun:sqlite'
import path from 'path'
import fs from 'fs'
import { ICacheManager } from './interfaces/cache'

/**
 * SQLite implementation of CacheManager for ministic-fishstick using bun:sqlite
 */
export class CacheManager implements ICacheManager {
  private db: Database | null = null
  private readonly dbPath: string
  private fileHashes: Map<string, string> = new Map()

  constructor(
    private workspacePath: string,
    cacheDir?: string
  ) {
    const targetDir = cacheDir || path.join(workspacePath, '.fishstick')
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    this.dbPath = path.join(targetDir, 'cache.sqlite')
  }

  /**
   * Initializes the cache manager and loads existing file hashes into memory
   */
  async initialize(): Promise<void> {
    this.db = new Database(this.dbPath)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec(`
			CREATE TABLE IF NOT EXISTS file_cache (
				file_path TEXT PRIMARY KEY,
				hash TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`)

    const rows = this.db.prepare('SELECT file_path, hash FROM file_cache').all() as Array<{
      file_path: string
      hash: string
    }>

    this.fileHashes.clear()
    for (const row of rows) {
      this.fileHashes.set(row.file_path, row.hash)
    }
  }

  /**
   * Clears the cache database table and resets in-memory cache
   */
  async clearCacheFile(): Promise<void> {
    if (this.db) {
      this.db.exec('DELETE FROM file_cache;')
    }
    this.fileHashes.clear()
  }

  /**
   * Gets the hash for a file path
   */
  getHash(filePath: string): string | undefined {
    return this.fileHashes.get(filePath)
  }

  /**
   * Updates the hash for a file path in both memory and SQLite
   */
  updateHash(filePath: string, hash: string): void {
    this.fileHashes.set(filePath, hash)
    if (this.db) {
      this.db
        .prepare(
          `
				INSERT INTO file_cache (file_path, hash, updated_at)
				VALUES ($filePath, $hash, $updatedAt)
				ON CONFLICT(file_path) DO UPDATE SET
					hash = excluded.hash,
					updated_at = excluded.updated_at;
			`
        )
        .run({
          $filePath: filePath,
          $hash: hash,
          $updatedAt: Date.now(),
        })
    }
  }

  /**
   * Deletes the hash for a file path
   */
  deleteHash(filePath: string): void {
    this.fileHashes.delete(filePath)
    if (this.db) {
      this.db.prepare('DELETE FROM file_cache WHERE file_path = $filePath').run({
        $filePath: filePath,
      })
    }
  }

  /**
   * Flushes cache writes (no-op for SQLite as transactions are auto-committed)
   */
  async flush(): Promise<void> {
    // SQLite statements are written synchronously
  }

  /**
   * Gets a copy of all file hashes
   */
  getAllHashes(): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, value] of this.fileHashes.entries()) {
      result[key] = value
    }
    return result
  }

  /**
   * Close database connection
   */
  dispose(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}
