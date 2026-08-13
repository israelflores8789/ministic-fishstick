import * as path from 'path'
import { VectorStoreSearchResult } from './interfaces'
import { IEmbedder } from './interfaces/embedder'
import { IVectorStore } from './interfaces/vector-store'
import { CodeIndexConfigManager } from './config/config-manager'
import { CodeIndexStateManager } from './state-manager'
import { getAppLogger } from './logger'

const logger = getAppLogger()

export class CodeIndexSearchService {
  constructor(
    private readonly configManager: CodeIndexConfigManager,
    private readonly stateManager: CodeIndexStateManager,
    private readonly embedder: IEmbedder,
    private readonly vectorStore: IVectorStore
  ) {}

  public async searchIndex(
    query: string,
    directoryPrefix?: string
  ): Promise<VectorStoreSearchResult[]> {
    if (!this.configManager.isFeatureEnabled) {
      throw new Error('Code index feature is disabled.')
    }

    const minScore = this.configManager.currentSearchMinScore
    const maxResults = this.configManager.currentSearchMaxResults

    const currentState = this.stateManager.getCurrentStatus().systemStatus
    if (currentState !== 'Indexed' && currentState !== 'Indexing') {
      throw new Error(`Code index is not ready for search. Current state: ${currentState}`)
    }

    try {
      const embeddingResponse = await this.embedder.createEmbeddings([query])
      const vector = embeddingResponse?.embeddings[0]
      if (!vector) {
        throw new Error('Failed to generate embedding for query.')
      }

      let normalizedPrefix: string | undefined = undefined
      if (directoryPrefix) {
        normalizedPrefix = path.normalize(directoryPrefix)
      }

      return await this.vectorStore.search(vector, normalizedPrefix, minScore, maxResults)
    } catch (error) {
      logger.error('[{location}] Error during search: {error}', {
        error,
        location: 'CodeIndexSearchService.searchIndex',
      })
      throw error
    }
  }
}
