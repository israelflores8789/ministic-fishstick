import { Database } from "bun:sqlite"
import path from "path"
import fs from "fs"
import { IVectorStore, PointStruct, VectorStoreSearchResult } from "../interfaces/vector-store"

/**
 * SQLite vector store implementation for zero-docker local vector search using bun:sqlite.
 */
export class SQLiteVectorStore implements IVectorStore {
	private db: Database | null = null
	private readonly dbPath: string
	private readonly vectorSize: number
	private readonly workspacePath: string

	constructor(workspacePath: string, dbDir?: string, vectorSize: number = 1536) {
		this.workspacePath = workspacePath
		this.vectorSize = vectorSize
		const targetDir = dbDir || path.join(workspacePath, ".fishstick")
		if (!fs.existsSync(targetDir)) {
			fs.mkdirSync(targetDir, { recursive: true })
		}
		this.dbPath = path.join(targetDir, "vectors.sqlite")
	}

	async initialize(): Promise<boolean> {
		let created = false
		if (!fs.existsSync(this.dbPath)) {
			created = true
		}

		this.db = new Database(this.dbPath)
		this.db.exec("PRAGMA journal_mode = WAL;")
		this.db.exec("PRAGMA synchronous = NORMAL;")

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS points (
				id TEXT PRIMARY KEY,
				file_path TEXT NOT NULL,
				vector BLOB NOT NULL,
				payload TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_file_path ON points(file_path);

			CREATE TABLE IF NOT EXISTS metadata (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
		`)

		return created
	}

	private ensureInitialized() {
		if (!this.db) {
			throw new Error("SQLiteVectorStore not initialized. Call initialize() first.")
		}
	}

	async upsertPoints(points: PointStruct[]): Promise<void> {
		this.ensureInitialized()
		if (points.length === 0) return

		const stmt = this.db!.prepare(`
			INSERT INTO points (id, file_path, vector, payload)
			VALUES ($id, $file_path, $vector, $payload)
			ON CONFLICT(id) DO UPDATE SET
				file_path = excluded.file_path,
				vector = excluded.vector,
				payload = excluded.payload;
		`)

		const transaction = this.db!.transaction((pointList: PointStruct[]) => {
			for (const p of pointList) {
				const filePath = p.payload?.filePath || ""
				const floatArray = new Float32Array(p.vector)
				const vectorBuffer = Buffer.from(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength)

				stmt.run({
					$id: String(p.id),
					$file_path: filePath,
					$vector: vectorBuffer,
					$payload: JSON.stringify(p.payload || {}),
				})
			}
		})

		transaction(points)
	}

	async search(
		queryVector: number[],
		directoryPrefix?: string,
		minScore: number = 0.0,
		maxResults: number = 20,
	): Promise<VectorStoreSearchResult[]> {
		this.ensureInitialized()

		let querySql = "SELECT id, file_path, vector, payload FROM points WHERE 1=1"
		const params: Record<string, any> = {}

		if (directoryPrefix) {
			const normalizedPrefix = path.normalize(directoryPrefix).replace(/\\/g, "/")
			if (normalizedPrefix !== "." && normalizedPrefix !== "./") {
				const cleaned = normalizedPrefix.replace(/^\.\//, "").replace(/\/$/, "")
				querySql += " AND (file_path = $prefix OR file_path LIKE $prefixLike)"
				params.$prefix = cleaned
				params.$prefixLike = `${cleaned}/%`
			}
		}

		const rows = this.db!.prepare(querySql).all(params) as Array<{
			id: string
			file_path: string
			vector: Uint8Array
			payload: string
		}>

		if (rows.length === 0) {
			return []
		}

		// Calculate query vector norm
		const qArray = new Float32Array(queryVector)
		let qNorm = 0
		for (let i = 0; i < qArray.length; i++) {
			qNorm += qArray[i] * qArray[i]
		}
		qNorm = Math.sqrt(qNorm)

		if (qNorm === 0) return []

		const results: VectorStoreSearchResult[] = []

		for (const row of rows) {
			const payloadObj = JSON.parse(row.payload)
			if (payloadObj.type === "metadata") continue

			// Deserialize Float32Array from BLOB
			const vBuffer = row.vector.buffer
			const vOffset = row.vector.byteOffset
			const vLength = row.vector.byteLength / Float32Array.BYTES_PER_ELEMENT
			const pArray = new Float32Array(vBuffer, vOffset, vLength)

			// Dot product & norm
			let dot = 0
			let pNorm = 0
			const len = Math.min(qArray.length, pArray.length)

			for (let i = 0; i < len; i++) {
				dot += qArray[i] * pArray[i]
				pNorm += pArray[i] * pArray[i]
			}

			pNorm = Math.sqrt(pNorm)
			const similarity = pNorm === 0 ? 0 : dot / (qNorm * pNorm)

			if (similarity >= minScore) {
				results.push({
					id: row.id,
					score: similarity,
					payload: payloadObj,
				})
			}
		}

		results.sort((a, b) => b.score - a.score)
		return results.slice(0, maxResults)
	}

	async deletePointsByFilePath(filePath: string): Promise<void> {
		await this.deletePointsByMultipleFilePaths([filePath])
	}

	async deletePointsByMultipleFilePaths(filePaths: string[]): Promise<void> {
		this.ensureInitialized()
		if (filePaths.length === 0) return

		const workspaceRoot = this.workspacePath
		const relativePaths = filePaths.map((fp) =>
			path.isAbsolute(fp) ? path.relative(workspaceRoot, fp) : fp,
		)

		const stmt = this.db!.prepare("DELETE FROM points WHERE file_path = $filePath")
		const transaction = this.db!.transaction((paths: string[]) => {
			for (const p of paths) {
				stmt.run({ $filePath: p })
			}
		})
		transaction(relativePaths)
	}

	async clearCollection(): Promise<void> {
		this.ensureInitialized()
		this.db!.exec("DELETE FROM points;")
		this.db!.exec("DELETE FROM metadata;")
	}

	async deleteCollection(): Promise<void> {
		this.ensureInitialized()
		this.db!.close()
		this.db = null
		if (fs.existsSync(this.dbPath)) {
			fs.unlinkSync(this.dbPath)
		}
	}

	async collectionExists(): Promise<boolean> {
		return fs.existsSync(this.dbPath)
	}

	async hasIndexedData(): Promise<boolean> {
		if (!fs.existsSync(this.dbPath)) return false
		this.ensureInitialized()

		const row = this.db!.prepare("SELECT value FROM metadata WHERE key = 'indexing_complete'").get() as
			| { value: string }
			| undefined

		if (row) {
			return row.value === "true"
		}

		const countRow = this.db!.prepare("SELECT COUNT(*) as count FROM points WHERE file_path != '__indexing_metadata__'").get() as {
			count: number
		}
		return (countRow?.count ?? 0) > 0
	}

	async markIndexingComplete(): Promise<void> {
		this.ensureInitialized()
		this.db!.prepare(`
			INSERT INTO metadata (key, value) VALUES ('indexing_complete', 'true')
			ON CONFLICT(key) DO UPDATE SET value = 'true';
		`).run()
	}

	async markIndexingIncomplete(): Promise<void> {
		this.ensureInitialized()
		this.db!.prepare(`
			INSERT INTO metadata (key, value) VALUES ('indexing_complete', 'false')
			ON CONFLICT(key) DO UPDATE SET value = 'false';
		`).run()
	}
}
