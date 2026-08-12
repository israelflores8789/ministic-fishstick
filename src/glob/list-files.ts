import path from "path"
import fs from "fs/promises"

const DIRS_TO_IGNORE = new Set([
	"node_modules",
	".git",
	".fishstick",
	"dist",
	"build",
	"out",
	"coverage",
	"__pycache__",
	".venv",
	"venv",
])

/**
 * List files in a directory recursively or non-recursively with a limit
 */
export async function listFiles(
	dirPath: string,
	recursive: boolean,
	limit: number,
): Promise<[string[], boolean]> {
	const absolutePath = path.resolve(dirPath)
	const results: string[] = []
	let limitReached = false

	async function walk(currentDir: string): Promise<boolean> {
		if (results.length >= limit) {
			limitReached = true
			return true
		}

		let entries
		try {
			entries = await fs.readdir(currentDir, { withFileTypes: true })
		} catch {
			return false
		}

		for (const entry of entries) {
			if (results.length >= limit) {
				limitReached = true
				return true
			}

			const fullPath = path.join(currentDir, entry.name)

			if (entry.isDirectory()) {
				if (DIRS_TO_IGNORE.has(entry.name)) {
					continue
				}
				results.push(fullPath + "/")
				if (recursive) {
					const stop = await walk(fullPath)
					if (stop) return true
				}
			} else if (entry.isFile()) {
				results.push(fullPath)
			}
		}

		return false
	}

	await walk(absolutePath)
	return [results, limitReached]
}
