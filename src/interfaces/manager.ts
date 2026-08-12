import { VectorStoreSearchResult } from "./vector-store"

export interface ICodeIndexManager {
	readonly state: IndexingState
	readonly isFeatureEnabled: boolean
	readonly isFeatureConfigured: boolean
	loadConfiguration(): Promise<void>
	startIndexing(): Promise<void>
	stopIndexing(): void
	stopWatcher(): void
	clearIndexData(): Promise<void>
	searchIndex(query: string, limit: number): Promise<VectorStoreSearchResult[]>
	getCurrentStatus(): { systemStatus: IndexingState; message?: string }
	dispose(): void
}

export type IndexingState = "Standby" | "Indexing" | "Indexed" | "Error" | "Stopping"

export interface IndexProgressUpdate {
	systemStatus: IndexingState
	message?: string
	processedBlockCount?: number
	totalBlockCount?: number
}
