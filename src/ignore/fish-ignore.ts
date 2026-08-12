import path from "path"
import fs from "fs/promises"
import fsSync from "fs"
import ignore, { Ignore } from "ignore"
import chokidar, { FSWatcher } from "chokidar"

/**
 * Controls file access and indexing by enforcing ignore patterns from both .gitignore and .fishignore.
 */
export class FishIgnoreController {
	private cwd: string
	private ignoreInstance: Ignore
	private watcher: FSWatcher | null = null
	public fishIgnoreContent: string | undefined

	constructor(cwd: string) {
		this.cwd = cwd
		this.ignoreInstance = ignore()
		this.fishIgnoreContent = undefined
	}

	/**
	 * Initialize the controller by loading custom patterns and setting up watcher
	 */
	async initialize(): Promise<void> {
		await this.loadIgnoreFiles()
		this.setupFileWatcher()
	}

	/**
	 * Set up file watcher for .fishignore and .gitignore changes
	 */
	private setupFileWatcher(): void {
		const ignoreFiles = [
			path.join(this.cwd, ".fishignore"),
			path.join(this.cwd, ".gitignore"),
		]

		this.watcher = chokidar.watch(ignoreFiles, {
			ignoreInitial: true,
			persistent: false,
		})

		const reload = () => {
			this.loadIgnoreFiles().catch((err) => {
				console.error("[FishIgnoreController] Error reloading ignore files:", err)
			})
		}

		this.watcher.on("add", reload)
		this.watcher.on("change", reload)
		this.watcher.on("unlink", reload)
	}

	/**
	 * Load custom patterns from .gitignore and .fishignore
	 */
	private async loadIgnoreFiles(): Promise<void> {
		try {
			this.ignoreInstance = ignore()

			// Default ignored files & directories
			this.ignoreInstance.add([
				".git",
				".fishignore",
				".fishstick.json",
				"node_modules",
			])

			// 1. Load .gitignore if present
			const gitignorePath = path.join(this.cwd, ".gitignore")
			if (fsSync.existsSync(gitignorePath)) {
				const content = await fs.readFile(gitignorePath, "utf8")
				this.ignoreInstance.add(content)
			}

			// 2. Load .fishignore if present
			const fishignorePath = path.join(this.cwd, ".fishignore")
			if (fsSync.existsSync(fishignorePath)) {
				const content = await fs.readFile(fishignorePath, "utf8")
				this.fishIgnoreContent = content
				this.ignoreInstance.add(content)
			} else {
				this.fishIgnoreContent = undefined
			}
		} catch (error) {
			console.error("[FishIgnoreController] Unexpected error loading ignore files:", error)
		}
	}

	/**
	 * Check if a file should be accessible / indexed
	 * @param filePath Path to check (relative or absolute)
	 * @returns true if accessible/indexed, false if ignored
	 */
	validateAccess(filePath: string): boolean {
		try {
			const absolutePath = path.isAbsolute(filePath)
				? filePath
				: path.resolve(this.cwd, filePath)

			let realPath: string
			try {
				realPath = fsSync.realpathSync(absolutePath)
			} catch {
				realPath = absolutePath
			}

			const relativePath = path.relative(this.cwd, realPath).replace(/\\/g, "/")
			if (!relativePath || relativePath.startsWith("..")) {
				return true // Outside workspace
			}

			return !this.ignoreInstance.ignores(relativePath)
		} catch (error) {
			return true
		}
	}

	/**
	 * Filter an array of relative paths, removing those that should be ignored
	 */
	filterPaths(paths: string[]): string[] {
		return paths.filter((p) => this.validateAccess(p))
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.watcher) {
			this.watcher.close().catch(() => {})
			this.watcher = null
		}
	}
}
