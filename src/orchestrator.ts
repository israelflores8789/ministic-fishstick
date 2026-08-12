import * as path from 'path'
import { CodeIndexConfigManager } from './config/config-manager'
import { CodeIndexStateManager, IndexingState } from './state-manager'
import { IFileWatcher, IVectorStore, BatchProcessingSummary } from './interfaces'
import { DirectoryScanner } from './processors'
import { CacheManager } from './cache-manager'
import { TelemetryService, TelemetryEventName } from './shared/telemetry-shim'
import { t } from './shared/i18n-shim'
import { logger } from './logger'

const log = logger('CodeIndexOrchestrator')

export class CodeIndexOrchestrator {
  private _fileWatcherSubscriptions: Array<{ dispose: () => void }> = []
  private _isProcessing: boolean = false
  private _abortController: AbortController | null = null

  constructor(
    private readonly configManager: CodeIndexConfigManager,
    private readonly stateManager: CodeIndexStateManager,
    private readonly workspacePath: string,
    private readonly cacheManager: CacheManager,
    private readonly vectorStore: IVectorStore,
    private readonly scanner: DirectoryScanner,
    private readonly fileWatcher: IFileWatcher
  ) {}

  private async _startWatcher(): Promise<void> {
    this.stateManager.setSystemState('Indexing', 'Initializing file watcher...')

    try {
      await this.fileWatcher.initialize()

      this._fileWatcherSubscriptions = [
        this.fileWatcher.onDidStartBatchProcessing(() => {}),
        this.fileWatcher.onBatchProgressUpdate(
          ({
            processedInBatch,
            totalInBatch,
            currentFile,
          }: {
            processedInBatch: number
            totalInBatch: number
            currentFile?: string
          }) => {
            if (totalInBatch > 0 && this.stateManager.state !== 'Indexing') {
              this.stateManager.setSystemState('Indexing', 'Processing file changes...')
            }
            this.stateManager.reportFileQueueProgress(
              processedInBatch,
              totalInBatch,
              currentFile ? path.basename(currentFile) : undefined
            )
            if (processedInBatch === totalInBatch) {
              if (totalInBatch > 0) {
                this.stateManager.setSystemState(
                  'Indexed',
                  'File changes processed. Index up-to-date.'
                )
              } else if (this.stateManager.state === 'Indexing') {
                this.stateManager.setSystemState('Indexed', 'Index up-to-date. File queue empty.')
              }
            }
          }
        ),
        this.fileWatcher.onDidFinishBatchProcessing((summary: BatchProcessingSummary) => {
          if (summary.batchError) {
            log.error('Batch processing failed:', summary.batchError)
          }
        }),
      ]
    } catch (error) {
      log.error('Failed to start file watcher:', error)
      TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
        error: error instanceof Error ? error.message : String(error),
        location: '_startWatcher',
      })
      throw error
    }
  }

  public async startIndexing(): Promise<void> {
    if (
      this._isProcessing ||
      (this.stateManager.state !== 'Standby' &&
        this.stateManager.state !== 'Error' &&
        this.stateManager.state !== 'Indexed')
    ) {
      log.warn(`Start rejected: Already processing or in state ${this.stateManager.state}.`)
      return
    }

    this._isProcessing = true
    this._abortController = new AbortController()
    const signal = this._abortController.signal
    this.stateManager.setSystemState('Indexing', 'Initializing services...')

    let indexingStarted = false

    try {
      const collectionCreated = await this.vectorStore.initialize()
      indexingStarted = true

      if (collectionCreated) {
        await this.cacheManager.clearCacheFile()
      }

      const hasExistingData = await this.vectorStore.hasIndexedData()

      if (hasExistingData && !collectionCreated) {
        this.stateManager.setSystemState('Indexing', 'Checking for new or modified files...')
        await this.vectorStore.markIndexingIncomplete()

        let cumulativeBlocksIndexed = 0
        let cumulativeBlocksFoundSoFar = 0
        const batchErrors: Error[] = []

        const handleFileParsed = (fileBlockCount: number) => {
          cumulativeBlocksFoundSoFar += fileBlockCount
          this.stateManager.reportBlockIndexingProgress(
            cumulativeBlocksIndexed,
            cumulativeBlocksFoundSoFar
          )
        }

        const handleBlocksIndexed = (indexedCount: number) => {
          cumulativeBlocksIndexed += indexedCount
          this.stateManager.reportBlockIndexingProgress(
            cumulativeBlocksIndexed,
            cumulativeBlocksFoundSoFar
          )
        }

        const result = await this.scanner.scanDirectory(
          this.workspacePath,
          (batchError: Error) => {
            log.error(`Error during incremental scan batch: ${batchError.message}`)
            batchErrors.push(batchError)
          },
          handleBlocksIndexed,
          handleFileParsed,
          signal
        )

        if (signal.aborted) {
          await this.cacheManager.flush()
          this.stopWatcher()
          this.stateManager.setSystemState('Standby', 'Indexing stopped.')
          return
        }

        if (!result) {
          throw new Error('Incremental scan failed, is scanner initialized?')
        }

        await this._startWatcher()
        await this.vectorStore.markIndexingComplete()
        this.stateManager.setSystemState('Indexed', 'File watcher started.')
      } else {
        this.stateManager.setSystemState('Indexing', 'Services ready. Starting workspace scan...')
        await this.vectorStore.markIndexingIncomplete()

        let cumulativeBlocksIndexed = 0
        let cumulativeBlocksFoundSoFar = 0
        const batchErrors: Error[] = []

        const handleFileParsed = (fileBlockCount: number) => {
          cumulativeBlocksFoundSoFar += fileBlockCount
          this.stateManager.reportBlockIndexingProgress(
            cumulativeBlocksIndexed,
            cumulativeBlocksFoundSoFar
          )
        }

        const handleBlocksIndexed = (indexedCount: number) => {
          cumulativeBlocksIndexed += indexedCount
          this.stateManager.reportBlockIndexingProgress(
            cumulativeBlocksIndexed,
            cumulativeBlocksFoundSoFar
          )
        }

        const result = await this.scanner.scanDirectory(
          this.workspacePath,
          (batchError: Error) => {
            log.error(`Error during initial scan batch: ${batchError.message}`)
            batchErrors.push(batchError)
          },
          handleBlocksIndexed,
          handleFileParsed,
          signal
        )

        if (signal.aborted) {
          await this.cacheManager.flush()
          this.stopWatcher()
          this.stateManager.setSystemState('Standby', 'Indexing stopped.')
          return
        }

        if (!result) {
          throw new Error('Scan failed, is scanner initialized?')
        }

        await this._startWatcher()
        await this.vectorStore.markIndexingComplete()
        this.stateManager.setSystemState('Indexed', 'File watcher started.')
      }
    } catch (error: any) {
      if (error?.name === 'AbortError' || signal.aborted) {
        log.warn('Indexing aborted by user.')
        await this.cacheManager.flush()
        this.stopWatcher()
        this.stateManager.setSystemState('Standby', 'Indexing stopped.')
        return
      }

      log.error('Error during indexing:', error)
      TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
        error: error instanceof Error ? error.message : String(error),
        location: 'startIndexing',
      })

      if (indexingStarted) {
        try {
          await this.vectorStore.clearCollection()
        } catch (cleanupError) {
          log.error('Failed to clean up after error:', cleanupError)
        }
        await this.cacheManager.clearCacheFile()
      }

      this.stateManager.setSystemState(
        'Error',
        `Failed during scan: ${error.message || 'Unknown error'}`
      )
      this.stopWatcher()
    } finally {
      this._isProcessing = false
      this._abortController = null
    }
  }

  public stopIndexing(): void {
    if (this._abortController) {
      this.stateManager.setSystemState('Stopping', 'Indexing stopping...')
      this._abortController.abort()
      this._abortController = null
    }
    this.stopWatcher()
  }

  public stopWatcher(): void {
    this.fileWatcher.dispose()
    this._fileWatcherSubscriptions.forEach((sub) => sub.dispose())
    this._fileWatcherSubscriptions = []

    if (this.stateManager.state !== 'Error' && this.stateManager.state !== 'Stopping') {
      this.stateManager.setSystemState('Standby', 'File watcher stopped.')
    }
    this._isProcessing = false
  }

  public async clearIndexData(): Promise<void> {
    this._isProcessing = true
    try {
      await this.stopWatcher()
      await this.vectorStore.deleteCollection()
      await this.cacheManager.clearCacheFile()
      if (this.stateManager.state !== 'Error') {
        this.stateManager.setSystemState('Standby', 'Index data cleared successfully.')
      }
    } finally {
      this._isProcessing = false
    }
  }

  public get state(): IndexingState {
    return this.stateManager.state
  }
}
