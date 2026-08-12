import { EventEmitter } from "events"

export type IndexingState = "Standby" | "Indexing" | "Indexed" | "Error" | "Stopping"

export class CodeIndexStateManager {
	private _systemStatus: IndexingState = "Standby"
	private _statusMessage: string = ""
	private _processedItems: number = 0
	private _totalItems: number = 0
	private _currentItemUnit: string = "blocks"
	private _emitter = new EventEmitter()

	public onProgressUpdate(listener: (status: ReturnType<typeof this.getCurrentStatus>) => void) {
		this._emitter.on("progress", listener)
		return {
			dispose: () => {
				this._emitter.off("progress", listener)
			},
		}
	}

	public get state(): IndexingState {
		return this._systemStatus
	}

	public getCurrentStatus() {
		return {
			systemStatus: this._systemStatus,
			message: this._statusMessage,
			processedItems: this._processedItems,
			totalItems: this._totalItems,
			currentItemUnit: this._currentItemUnit,
		}
	}

	public setSystemState(newState: IndexingState, message?: string): void {
		const stateChanged =
			newState !== this._systemStatus || (message !== undefined && message !== this._statusMessage)

		if (stateChanged) {
			this._systemStatus = newState
			if (message !== undefined) {
				this._statusMessage = message
			}

			if (newState !== "Indexing") {
				this._processedItems = 0
				this._totalItems = 0
				this._currentItemUnit = "blocks"
				if (newState === "Standby" && message === undefined) this._statusMessage = "Ready."
				if (newState === "Indexed" && message === undefined) this._statusMessage = "Index up-to-date."
				if (newState === "Error" && message === undefined) this._statusMessage = "An error occurred."
			}

			this._emitter.emit("progress", this.getCurrentStatus())
		}
	}

	public reportBlockIndexingProgress(processedItems: number, totalItems: number): void {
		const progressChanged = processedItems !== this._processedItems || totalItems !== this._totalItems

		if (this._systemStatus === "Stopping") return
		if (progressChanged || this._systemStatus !== "Indexing") {
			this._processedItems = processedItems
			this._totalItems = totalItems
			this._currentItemUnit = "blocks"

			const message = `Indexed ${this._processedItems} / ${this._totalItems} ${this._currentItemUnit} found`
			const oldStatus = this._systemStatus
			const oldMessage = this._statusMessage

			this._systemStatus = "Indexing"
			this._statusMessage = message

			if (oldStatus !== this._systemStatus || oldMessage !== this._statusMessage || progressChanged) {
				this._emitter.emit("progress", this.getCurrentStatus())
			}
		}
	}

	public reportFileQueueProgress(processedFiles: number, totalFiles: number, currentFileBasename?: string): void {
		const progressChanged = processedFiles !== this._processedItems || totalFiles !== this._totalItems

		if (this._systemStatus === "Stopping") return
		if (progressChanged || this._systemStatus !== "Indexing") {
			this._processedItems = processedFiles
			this._totalItems = totalFiles
			this._currentItemUnit = "files"
			this._systemStatus = "Indexing"

			let message: string
			if (totalFiles > 0 && processedFiles < totalFiles) {
				message = `Processing ${processedFiles} / ${totalFiles} ${this._currentItemUnit}. Current: ${
					currentFileBasename || "..."
				}`
			} else if (totalFiles > 0 && processedFiles === totalFiles) {
				message = `Finished processing ${totalFiles} ${this._currentItemUnit} from queue.`
			} else {
				message = `File queue processed.`
			}

			const oldStatus = this._systemStatus
			const oldMessage = this._statusMessage

			this._statusMessage = message

			if (oldStatus !== this._systemStatus || oldMessage !== this._statusMessage || progressChanged) {
				this._emitter.emit("progress", this.getCurrentStatus())
			}
		}
	}

	public dispose(): void {
		this._emitter.removeAllListeners()
	}
}
