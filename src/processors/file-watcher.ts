import {
  QDRANT_CODE_BLOCK_NAMESPACE,
  MAX_FILE_SIZE_BYTES,
  BATCH_SEGMENT_THRESHOLD,
  MAX_BATCH_RETRIES,
  INITIAL_RETRY_DELAY_MS,
} from '../constants'
import { createHash } from 'crypto'
import { FishIgnoreController } from '../ignore/fish-ignore'
import { v5 as uuidv5 } from 'uuid'
import { Ignore } from 'ignore'
import { scannerExtensions } from '../shared/supported-extensions'
import {
  IFileWatcher,
  FileProcessingResult,
  IEmbedder,
  IVectorStore,
  PointStruct,
  BatchProcessingSummary,
} from '../interfaces'
import { codeParser } from './parser'
import { CacheManager } from '../cache-manager'
import {
  generateNormalizedAbsolutePath,
  generateRelativeFilePath,
} from '../shared/get-relative-path'
import chokidar, { FSWatcher } from 'chokidar'
import { readFile, stat } from 'fs/promises'
import { EventEmitter } from 'events'

export class FileWatcher implements IFileWatcher {
  private ignoreInstance?: Ignore
  private fsWatcher?: FSWatcher
  private ignoreController: FishIgnoreController
  private accumulatedEvents: Map<
    string,
    { filePath: string; type: 'create' | 'change' | 'delete' }
  > = new Map()
  private batchProcessDebounceTimer?: NodeJS.Timeout
  private readonly BATCH_DEBOUNCE_DELAY_MS = 500
  private readonly FILE_PROCESSING_CONCURRENCY_LIMIT = 10
  private readonly batchSegmentThreshold: number
  private emitter = new EventEmitter()

  public onDidStartBatchProcessing(listener: (filePaths: string[]) => void) {
    this.emitter.on('start', listener)
    return { dispose: () => this.emitter.off('start', listener) }
  }

  public onBatchProgressUpdate(
    listener: (update: {
      processedInBatch: number
      totalInBatch: number
      currentFile?: string
    }) => void
  ) {
    this.emitter.on('progress', listener)
    return { dispose: () => this.emitter.off('progress', listener) }
  }

  public onDidFinishBatchProcessing(listener: (summary: BatchProcessingSummary) => void) {
    this.emitter.on('finish', listener)
    return { dispose: () => this.emitter.off('finish', listener) }
  }

  constructor(
    private workspacePath: string,
    private readonly cacheManager: CacheManager,
    private embedder?: IEmbedder,
    private vectorStore?: IVectorStore,
    ignoreInstance?: Ignore,
    ignoreController?: FishIgnoreController,
    batchSegmentThreshold?: number
  ) {
    this.ignoreController = ignoreController || new FishIgnoreController(workspacePath)
    if (ignoreInstance) {
      this.ignoreInstance = ignoreInstance
    }
    this.batchSegmentThreshold = batchSegmentThreshold ?? BATCH_SEGMENT_THRESHOLD
  }

  async initialize(): Promise<void> {
    this.fsWatcher = chokidar.watch(this.workspacePath, {
      ignored: (pathStr) => {
        const rel = generateRelativeFilePath(pathStr, this.workspacePath)
        const ext = pathStr.split('.').pop()?.toLowerCase()
        if (!ext) return false
        return !scannerExtensions.includes(`.${ext}`) && !pathStr.endsWith('.fishignore')
      },
      persistent: true,
      ignoreInitial: true,
    })

    this.fsWatcher.on('add', (fp) => this.handleFileCreated(fp))
    this.fsWatcher.on('change', (fp) => this.handleFileChanged(fp))
    this.fsWatcher.on('unlink', (fp) => this.handleFileDeleted(fp))
  }

  dispose(): void {
    if (this.fsWatcher) {
      this.fsWatcher.close().catch(() => {})
    }
    if (this.batchProcessDebounceTimer) {
      clearTimeout(this.batchProcessDebounceTimer)
    }
    this.emitter.removeAllListeners()
    this.accumulatedEvents.clear()
  }

  private async handleFileCreated(filePath: string): Promise<void> {
    this.accumulatedEvents.set(filePath, { filePath, type: 'create' })
    this.scheduleBatchProcessing()
  }

  private async handleFileChanged(filePath: string): Promise<void> {
    this.accumulatedEvents.set(filePath, { filePath, type: 'change' })
    this.scheduleBatchProcessing()
  }

  private async handleFileDeleted(filePath: string): Promise<void> {
    this.accumulatedEvents.set(filePath, { filePath, type: 'delete' })
    this.scheduleBatchProcessing()
  }

  private scheduleBatchProcessing(): void {
    if (this.batchProcessDebounceTimer) {
      clearTimeout(this.batchProcessDebounceTimer)
    }
    this.batchProcessDebounceTimer = setTimeout(
      () => this.triggerBatchProcessing(),
      this.BATCH_DEBOUNCE_DELAY_MS
    )
  }

  private async triggerBatchProcessing(): Promise<void> {
    if (this.accumulatedEvents.size === 0) return

    const eventsToProcess = new Map(this.accumulatedEvents)
    this.accumulatedEvents.clear()

    const filePathsInBatch = Array.from(eventsToProcess.keys())
    this.emitter.emit('start', filePathsInBatch)

    await this.processBatch(eventsToProcess)
  }

  private async _handleBatchDeletions(
    batchResults: FileProcessingResult[],
    processedCountInBatch: number,
    totalFilesInBatch: number,
    pathsToExplicitlyDelete: string[],
    filesToUpsertDetails: Array<{ path: string; originalType: 'create' | 'change' }>
  ): Promise<{ overallBatchError?: Error; clearedPaths: Set<string>; processedCount: number }> {
    let overallBatchError: Error | undefined
    const allPathsToClearFromDB = new Set<string>(pathsToExplicitlyDelete)

    for (const fileDetail of filesToUpsertDetails) {
      if (fileDetail.originalType === 'change') {
        allPathsToClearFromDB.add(fileDetail.path)
      }
    }

    if (allPathsToClearFromDB.size > 0 && this.vectorStore) {
      try {
        await this.vectorStore.deletePointsByMultipleFilePaths(Array.from(allPathsToClearFromDB))

        for (const path of pathsToExplicitlyDelete) {
          this.cacheManager.deleteHash(path)
          batchResults.push({ path, status: 'success' })
          processedCountInBatch++
          this.emitter.emit('progress', {
            processedInBatch: processedCountInBatch,
            totalInBatch: totalFilesInBatch,
            currentFile: path,
          })
        }
      } catch (error: any) {
        overallBatchError = error as Error
        for (const path of pathsToExplicitlyDelete) {
          batchResults.push({ path, status: 'error', error: error as Error })
          processedCountInBatch++
          this.emitter.emit('progress', {
            processedInBatch: processedCountInBatch,
            totalInBatch: totalFilesInBatch,
            currentFile: path,
          })
        }
      }
    }

    return {
      overallBatchError,
      clearedPaths: allPathsToClearFromDB,
      processedCount: processedCountInBatch,
    }
  }

  private async _processFilesAndPrepareUpserts(
    filesToUpsertDetails: Array<{ path: string; originalType: 'create' | 'change' }>,
    batchResults: FileProcessingResult[],
    processedCountInBatch: number,
    totalFilesInBatch: number,
    pathsToExplicitlyDelete: string[]
  ): Promise<{
    pointsForBatchUpsert: PointStruct[]
    successfullyProcessedForUpsert: Array<{ path: string; newHash?: string }>
    processedCount: number
  }> {
    const pointsForBatchUpsert: PointStruct[] = []
    const successfullyProcessedForUpsert: Array<{ path: string; newHash?: string }> = []
    const filesToProcessConcurrently = [...filesToUpsertDetails]

    for (
      let i = 0;
      i < filesToProcessConcurrently.length;
      i += this.FILE_PROCESSING_CONCURRENCY_LIMIT
    ) {
      const chunkToProcess = filesToProcessConcurrently.slice(
        i,
        i + this.FILE_PROCESSING_CONCURRENCY_LIMIT
      )

      const chunkProcessingPromises = chunkToProcess.map(async (fileDetail) => {
        this.emitter.emit('progress', {
          processedInBatch: processedCountInBatch,
          totalInBatch: totalFilesInBatch,
          currentFile: fileDetail.path,
        })
        try {
          const result = await this.processFile(fileDetail.path)
          return { path: fileDetail.path, result, error: undefined }
        } catch (e) {
          const error = e as Error
          return { path: fileDetail.path, result: undefined, error }
        }
      })

      const settledChunkResults = await Promise.allSettled(chunkProcessingPromises)

      for (const settledResult of settledChunkResults) {
        let resultPath: string | undefined

        if (settledResult.status === 'fulfilled') {
          const { path, result, error: directError } = settledResult.value
          resultPath = path

          if (directError) {
            batchResults.push({ path, status: 'error', error: directError })
          } else if (result) {
            if (result.status === 'skipped' || result.status === 'local_error') {
              batchResults.push(result)
            } else if (result.status === 'processed_for_batching' && result.pointsToUpsert) {
              pointsForBatchUpsert.push(...result.pointsToUpsert)
              if (result.path && result.newHash) {
                successfullyProcessedForUpsert.push({ path: result.path, newHash: result.newHash })
              } else if (result.path) {
                successfullyProcessedForUpsert.push({ path: result.path })
              }
            }
          }
        }

        if (!pathsToExplicitlyDelete.includes(resultPath || '')) {
          processedCountInBatch++
        }
        this.emitter.emit('progress', {
          processedInBatch: processedCountInBatch,
          totalInBatch: totalFilesInBatch,
          currentFile: resultPath,
        })
      }
    }

    return {
      pointsForBatchUpsert,
      successfullyProcessedForUpsert,
      processedCount: processedCountInBatch,
    }
  }

  private async _executeBatchUpsertOperations(
    pointsForBatchUpsert: PointStruct[],
    successfullyProcessedForUpsert: Array<{ path: string; newHash?: string }>,
    batchResults: FileProcessingResult[],
    overallBatchError?: Error
  ): Promise<Error | undefined> {
    if (pointsForBatchUpsert.length > 0 && this.vectorStore && !overallBatchError) {
      try {
        for (let i = 0; i < pointsForBatchUpsert.length; i += this.batchSegmentThreshold) {
          const batch = pointsForBatchUpsert.slice(i, i + this.batchSegmentThreshold)
          let retryCount = 0

          while (retryCount < MAX_BATCH_RETRIES) {
            try {
              await this.vectorStore.upsertPoints(batch)
              break
            } catch (error) {
              retryCount++
              if (retryCount === MAX_BATCH_RETRIES) {
                throw error
              }
              await new Promise((resolve) =>
                setTimeout(resolve, INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount - 1))
              )
            }
          }
        }

        for (const { path, newHash } of successfullyProcessedForUpsert) {
          if (newHash) {
            this.cacheManager.updateHash(path, newHash)
          }
          batchResults.push({ path, status: 'success' })
        }
      } catch (error) {
        const err = error as Error
        overallBatchError = overallBatchError || err
        for (const { path } of successfullyProcessedForUpsert) {
          batchResults.push({ path, status: 'error', error: err })
        }
      }
    }
    return overallBatchError
  }

  private async processBatch(
    eventsToProcess: Map<string, { filePath: string; type: 'create' | 'change' | 'delete' }>
  ): Promise<void> {
    const batchResults: FileProcessingResult[] = []
    let processedCountInBatch = 0
    const totalFilesInBatch = eventsToProcess.size
    let overallBatchError: Error | undefined

    this.emitter.emit('progress', {
      processedInBatch: 0,
      totalInBatch: totalFilesInBatch,
      currentFile: undefined,
    })

    const pathsToExplicitlyDelete: string[] = []
    const filesToUpsertDetails: Array<{ path: string; originalType: 'create' | 'change' }> = []

    for (const event of eventsToProcess.values()) {
      if (event.type === 'delete') {
        pathsToExplicitlyDelete.push(event.filePath)
      } else {
        filesToUpsertDetails.push({
          path: event.filePath,
          originalType: event.type,
        })
      }
    }

    const { overallBatchError: deletionError, processedCount: deletionCount } =
      await this._handleBatchDeletions(
        batchResults,
        processedCountInBatch,
        totalFilesInBatch,
        pathsToExplicitlyDelete,
        filesToUpsertDetails
      )
    overallBatchError = deletionError
    processedCountInBatch = deletionCount

    const {
      pointsForBatchUpsert,
      successfullyProcessedForUpsert,
      processedCount: upsertCount,
    } = await this._processFilesAndPrepareUpserts(
      filesToUpsertDetails,
      batchResults,
      processedCountInBatch,
      totalFilesInBatch,
      pathsToExplicitlyDelete
    )
    processedCountInBatch = upsertCount

    overallBatchError = await this._executeBatchUpsertOperations(
      pointsForBatchUpsert,
      successfullyProcessedForUpsert,
      batchResults,
      overallBatchError
    )

    this.emitter.emit('finish', {
      processedFiles: batchResults,
      batchError: overallBatchError,
    })
  }

  async processFile(filePath: string): Promise<FileProcessingResult> {
    try {
      const relativeFilePath = generateRelativeFilePath(filePath, this.workspacePath)

      if (
        !this.ignoreController.validateAccess(filePath) ||
        (this.ignoreInstance && this.ignoreInstance.ignores(relativeFilePath))
      ) {
        return {
          path: filePath,
          status: 'skipped' as const,
          reason: 'File is ignored by .fishignore or .gitignore',
        }
      }

      const fileStat = await stat(filePath)
      if (fileStat.size > MAX_FILE_SIZE_BYTES) {
        return {
          path: filePath,
          status: 'skipped' as const,
          reason: 'File is too large',
        }
      }

      const content = await readFile(filePath, 'utf-8')
      const newHash = createHash('sha256').update(content).digest('hex')

      if (this.cacheManager.getHash(filePath) === newHash) {
        return {
          path: filePath,
          status: 'skipped' as const,
          reason: 'File has not changed',
        }
      }

      const blocks = await codeParser.parseFile(filePath, { content, fileHash: newHash })

      let pointsToUpsert: PointStruct[] = []
      if (this.embedder && blocks.length > 0) {
        const texts = blocks.map((block) => block.content)
        const { embeddings } = await this.embedder.createEmbeddings(texts)

        pointsToUpsert = blocks.map((block, index) => {
          const normalizedAbsolutePath = generateNormalizedAbsolutePath(
            block.file_path,
            this.workspacePath
          )
          const stableName = `${normalizedAbsolutePath}:${block.start_line}`
          const pointId = uuidv5(stableName, QDRANT_CODE_BLOCK_NAMESPACE)

          return {
            id: pointId,
            vector: embeddings[index],
            payload: {
              filePath: generateRelativeFilePath(normalizedAbsolutePath, this.workspacePath),
              codeChunk: block.content,
              startLine: block.start_line,
              endLine: block.end_line,
            },
          }
        })
      }

      return {
        path: filePath,
        status: 'processed_for_batching' as const,
        newHash,
        pointsToUpsert,
      }
    } catch (error) {
      return {
        path: filePath,
        status: 'local_error' as const,
        error: error as Error,
      }
    }
  }
}
