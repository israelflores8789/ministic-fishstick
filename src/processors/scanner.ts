import { listFiles } from '../glob/list-files'
import { Ignore } from 'ignore'
import { FishIgnoreController } from '../ignore/fish-ignore'
import { stat, readFile } from 'fs/promises'
import * as path from 'path'
import {
  generateNormalizedAbsolutePath,
  generateRelativeFilePath,
} from '../shared/get-relative-path'
import { scannerExtensions } from '../shared/supported-extensions'
import { CodeBlock, ICodeParser, IEmbedder, IVectorStore, IDirectoryScanner } from '../interfaces'
import { createHash } from 'crypto'
import { v5 as uuidv5 } from 'uuid'
import pLimit from 'p-limit'
import { Mutex } from 'async-mutex'
import { CacheManager } from '../core/cache-manager'
import { t } from '../shared/i18n-shim'
import { getAppLogger } from '../logger'

const logger = getAppLogger(['processor', 'scanner'])

import {
  QDRANT_CODE_BLOCK_NAMESPACE,
  MAX_FILE_SIZE_BYTES,
  MAX_LIST_FILES_LIMIT_CODE_INDEX,
  BATCH_SEGMENT_THRESHOLD,
  MAX_BATCH_RETRIES,
  INITIAL_RETRY_DELAY_MS,
  PARSING_CONCURRENCY,
  BATCH_PROCESSING_CONCURRENCY,
  MAX_PENDING_BATCHES,
} from '../constants'

export class DirectoryScanner implements IDirectoryScanner {
  private readonly batchSegmentThreshold: number

  constructor(
    private readonly embedder: IEmbedder,
    private readonly vectorStore: IVectorStore,
    private readonly codeParser: ICodeParser,
    private readonly cacheManager: CacheManager,
    private readonly ignoreInstance: Ignore,
    batchSegmentThreshold?: number
  ) {
    this.batchSegmentThreshold = batchSegmentThreshold ?? BATCH_SEGMENT_THRESHOLD
  }

  public async scanDirectory(
    directory: string,
    onError?: (error: Error) => void,
    onBlocksIndexed?: (indexedCount: number) => void,
    onFileParsed?: (fileBlockCount: number) => void,
    signal?: AbortSignal
  ): Promise<{ stats: { processed: number; skipped: number }; totalBlockCount: number }> {
    const directoryPath = path.resolve(directory)
    const [allPaths, _] = await listFiles(directoryPath, true, MAX_LIST_FILES_LIMIT_CODE_INDEX)
    const filePaths = allPaths.filter((p) => !p.endsWith('/'))

    const ignoreController = new FishIgnoreController(directoryPath)
    await ignoreController.initialize()

    const allowedPaths = ignoreController.filterPaths(filePaths)

    const supportedPaths = allowedPaths.filter((filePath) => {
      const ext = path.extname(filePath).toLowerCase()
      const relativeFilePath = generateRelativeFilePath(filePath, directoryPath)
      return scannerExtensions.includes(ext) && !this.ignoreInstance.ignores(relativeFilePath)
    })

    const processedFiles = new Set<string>()
    let processedCount = 0
    let skippedCount = 0

    const parseLimiter = pLimit(PARSING_CONCURRENCY)
    const batchLimiter = pLimit(BATCH_PROCESSING_CONCURRENCY)
    const mutex = new Mutex()

    let currentBatchBlocks: CodeBlock[] = []
    let currentBatchTexts: string[] = []
    let currentBatchFileInfos: { filePath: string; fileHash: string; isNew: boolean }[] = []
    const activeBatchPromises = new Set<Promise<void>>()
    let pendingBatchCount = 0

    let totalBlockCount = 0

    const parsePromises = supportedPaths.map((filePath) =>
      parseLimiter(async () => {
        if (signal?.aborted) return

        try {
          const stats = await stat(filePath)
          if (stats.size > MAX_FILE_SIZE_BYTES) {
            skippedCount++
            return
          }

          const content = await readFile(filePath, 'utf-8')
          const currentFileHash = createHash('sha256').update(content).digest('hex')
          processedFiles.add(filePath)

          const cachedFileHash = this.cacheManager.getHash(filePath)
          const isNewFile = !cachedFileHash
          if (cachedFileHash === currentFileHash) {
            skippedCount++
            return
          }

          const blocks = await this.codeParser.parseFile(filePath, {
            content,
            fileHash: currentFileHash,
          })
          const fileBlockCount = blocks.length
          onFileParsed?.(fileBlockCount)
          processedCount++

          if (this.embedder && this.vectorStore && blocks.length > 0) {
            let addedBlocksFromFile = false
            for (const block of blocks) {
              const trimmedContent = block.content.trim()
              if (trimmedContent) {
                const release = await mutex.acquire()
                try {
                  currentBatchBlocks.push(block)
                  currentBatchTexts.push(trimmedContent)
                  addedBlocksFromFile = true

                  if (signal?.aborted) {
                    throw new DOMException('Indexing aborted', 'AbortError')
                  }

                  if (currentBatchBlocks.length >= this.batchSegmentThreshold) {
                    while (pendingBatchCount >= MAX_PENDING_BATCHES) {
                      if (signal?.aborted) {
                        throw new DOMException('Indexing aborted', 'AbortError')
                      }
                      await Promise.race(activeBatchPromises)
                    }

                    const batchBlocks = [...currentBatchBlocks]
                    const batchTexts = [...currentBatchTexts]
                    const batchFileInfos = [...currentBatchFileInfos]
                    currentBatchBlocks = []
                    currentBatchTexts = []
                    currentBatchFileInfos = []

                    pendingBatchCount++

                    const batchPromise = batchLimiter(() =>
                      this.processBatch(
                        batchBlocks,
                        batchTexts,
                        batchFileInfos,
                        directoryPath,
                        onError,
                        onBlocksIndexed
                      )
                    )
                    activeBatchPromises.add(batchPromise)

                    batchPromise.finally(() => {
                      activeBatchPromises.delete(batchPromise)
                      pendingBatchCount--
                    })
                  }
                } finally {
                  release()
                }
              }
            }

            if (addedBlocksFromFile) {
              const release = await mutex.acquire()
              try {
                totalBlockCount += fileBlockCount
                currentBatchFileInfos.push({
                  filePath,
                  fileHash: currentFileHash,
                  isNew: isNewFile,
                })
              } finally {
                release()
              }
            }
          } else {
            this.cacheManager.updateHash(filePath, currentFileHash)
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw error
          }
          logger.error('[{location}] Error processing file {filePath}: {error}', {
            error,
            filePath,
            location: 'scanDirectory:processFile',
          })
          if (onError) {
            onError(error instanceof Error ? error : new Error(String(error)))
          }
        }
      })
    )

    await Promise.all(parsePromises)

    if (signal?.aborted) {
      return { stats: { processed: processedCount, skipped: skippedCount }, totalBlockCount }
    }

    if (currentBatchBlocks.length > 0) {
      const release = await mutex.acquire()
      try {
        const batchBlocks = [...currentBatchBlocks]
        const batchTexts = [...currentBatchTexts]
        const batchFileInfos = [...currentBatchFileInfos]
        currentBatchBlocks = []
        currentBatchTexts = []
        currentBatchFileInfos = []

        pendingBatchCount++

        const batchPromise = batchLimiter(() =>
          this.processBatch(
            batchBlocks,
            batchTexts,
            batchFileInfos,
            directoryPath,
            onError,
            onBlocksIndexed
          )
        )
        activeBatchPromises.add(batchPromise)

        batchPromise.finally(() => {
          activeBatchPromises.delete(batchPromise)
          pendingBatchCount--
        })
      } finally {
        release()
      }
    }

    await Promise.all(activeBatchPromises)

    if (signal?.aborted) {
      return { stats: { processed: processedCount, skipped: skippedCount }, totalBlockCount }
    }

    const oldHashes = this.cacheManager.getAllHashes()
    for (const cachedFilePath of Object.keys(oldHashes)) {
      if (!processedFiles.has(cachedFilePath)) {
        if (this.vectorStore) {
          try {
            await this.vectorStore.deletePointsByFilePath(cachedFilePath)
            this.cacheManager.deleteHash(cachedFilePath)
          } catch (error: any) {
            logger.error('[{location}] Failed to delete points for {filePath}: {error}', {
              error,
              location: 'scanDirectory:deletePoints',
              filePath: cachedFilePath,
            })
          }
        }
      }
    }

    return { stats: { processed: processedCount, skipped: skippedCount }, totalBlockCount }
  }

  private async processBatch(
    batchBlocks: CodeBlock[],
    batchTexts: string[],
    batchFileInfos: { filePath: string; fileHash: string; isNew: boolean }[],
    scanWorkspace: string,
    onError?: (error: Error) => void,
    onBlocksIndexed?: (indexedCount: number) => void
  ): Promise<void> {
    if (batchBlocks.length === 0) return

    let attempts = 0
    let success = false
    let lastError: Error | null = null

    while (attempts < MAX_BATCH_RETRIES && !success) {
      attempts++
      try {
        const uniqueFilePaths = [
          ...new Set(batchFileInfos.filter((info) => !info.isNew).map((info) => info.filePath)),
        ]
        if (uniqueFilePaths.length > 0) {
          await this.vectorStore.deletePointsByMultipleFilePaths(uniqueFilePaths)
        }

        const { embeddings } = await this.embedder.createEmbeddings(batchTexts)

        const points = batchBlocks.map((block, index) => {
          const normalizedAbsolutePath = generateNormalizedAbsolutePath(
            block.file_path,
            scanWorkspace
          )
          const pointId = uuidv5(block.segmentHash, QDRANT_CODE_BLOCK_NAMESPACE)

          return {
            id: pointId,
            vector: embeddings[index],
            payload: {
              filePath: generateRelativeFilePath(normalizedAbsolutePath, scanWorkspace),
              codeChunk: block.content,
              startLine: block.start_line,
              endLine: block.end_line,
              segmentHash: block.segmentHash,
            },
          }
        })

        await this.vectorStore.upsertPoints(points)
        onBlocksIndexed?.(batchBlocks.length)

        for (const fileInfo of batchFileInfos) {
          this.cacheManager.updateHash(fileInfo.filePath, fileInfo.fileHash)
        }
        success = true
      } catch (error) {
        lastError = error as Error
        if (attempts < MAX_BATCH_RETRIES) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempts - 1)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    if (!success && lastError && onError) {
      onError(lastError)
    }
  }
}
