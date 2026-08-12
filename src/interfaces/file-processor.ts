import { PointStruct } from "./vector-store"

export interface ICodeParser {
	parseFile(
		filePath: string,
		options?: {
			minBlockLines?: number
			maxBlockLines?: number
			content?: string
			fileHash?: string
		},
	): Promise<CodeBlock[]>
}

export interface IDirectoryScanner {
	scanDirectory(
		directory: string,
		onError?: (error: Error) => void,
		onBlocksIndexed?: (indexedCount: number) => void,
		onFileParsed?: (fileBlockCount: number) => void,
		signal?: AbortSignal,
	): Promise<{
		stats: {
			processed: number
			skipped: number
		}
		totalBlockCount: number
	}>
}

export interface IFileWatcher {
	initialize(): Promise<void>
	dispose(): void
	onDidStartBatchProcessing(listener: (filePaths: string[]) => void): { dispose: () => void }
	onBatchProgressUpdate(listener: (update: { processedInBatch: number; totalInBatch: number; currentFile?: string }) => void): { dispose: () => void }
	onDidFinishBatchProcessing(listener: (summary: BatchProcessingSummary) => void): { dispose: () => void }
	processFile(filePath: string): Promise<FileProcessingResult>
}

export interface BatchProcessingSummary {
	processedFiles: FileProcessingResult[]
	batchError?: Error
}

export interface FileProcessingResult {
	path: string
	status: "success" | "skipped" | "error" | "processed_for_batching" | "local_error"
	error?: Error
	reason?: string
	newHash?: string
	pointsToUpsert?: PointStruct[]
}

export interface CodeBlock {
	file_path: string
	identifier: string | null
	type: string
	start_line: number
	end_line: number
	content: string
	fileHash: string
	segmentHash: string
}
