import { OpenAI } from 'openai'
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from '../interfaces/embedder'
import {
  MAX_BATCH_TOKENS,
  MAX_ITEM_TOKENS,
  MAX_BATCH_RETRIES as MAX_RETRIES,
  INITIAL_RETRY_DELAY_MS as INITIAL_DELAY_MS,
} from '../constants'
import { getDefaultModelId, getModelQueryPrefix } from '../shared/embeddingModels'
import { getAppLogger } from '../logger'

const logger = getAppLogger(['embedder', 'openai-compatible'])

/**
 * OpenAI-Compatible embedder impelemntation that uses the OpenAI API client to generate embeddings.
 * It supports batching, retrying on rate limits, and validating the configuration.
 *
 * Supported models:
 *
 * - text-embedding-3-small: (dimension: 1536)
 * - text-embedding-3-large: (dimension: 3072)
 * - text-embedding-ada-002: (dimension: 1536)
 * - nomic-embed-code: (dimension: 3584)
 */
export class OpenAICompatibleEmbedder implements IEmbedder {
  private client: OpenAI
  private readonly defaultModelId: string

  constructor(baseUrl: string, apiKey: string, modelId?: string) {
    this.client = new OpenAI({ baseURL: baseUrl, apiKey })
    this.defaultModelId = modelId || getDefaultModelId('openai-compatible')
  }

  async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
    const modelToUse = model || this.defaultModelId
    const queryPrefix = getModelQueryPrefix('openai-compatible', modelToUse)
    const processedTexts = queryPrefix
      ? texts.map((text) => (text.startsWith(queryPrefix) ? text : `${queryPrefix}${text}`))
      : texts

    const allEmbeddings: number[][] = []
    const usage = { promptTokens: 0, totalTokens: 0 }
    const remainingTexts = [...processedTexts]

    while (remainingTexts.length > 0) {
      const currentBatch: string[] = []
      let currentBatchTokens = 0
      const processedIndices: number[] = []

      for (let i = 0; i < remainingTexts.length; i++) {
        const text = remainingTexts[i]
        const itemTokens = Math.ceil(text.length / 4)

        if (itemTokens > MAX_ITEM_TOKENS) {
          processedIndices.push(i)
          continue
        }

        if (currentBatchTokens + itemTokens <= MAX_BATCH_TOKENS) {
          currentBatch.push(text)
          currentBatchTokens += itemTokens
          processedIndices.push(i)
        } else {
          break
        }
      }

      for (let i = processedIndices.length - 1; i >= 0; i--) {
        remainingTexts.splice(processedIndices[i], 1)
      }

      if (currentBatch.length > 0) {
        const batchResult = await this._embedBatchWithRetries(currentBatch, modelToUse)
        allEmbeddings.push(...batchResult.embeddings)
        usage.promptTokens += batchResult.usage.promptTokens
        usage.totalTokens += batchResult.usage.totalTokens
      }
    }

    return { embeddings: allEmbeddings, usage }
  }

  private async _embedBatchWithRetries(
    batchTexts: string[],
    model: string
  ): Promise<{ embeddings: number[][]; usage: { promptTokens: number; totalTokens: number } }> {
    for (let attempts = 0; attempts < MAX_RETRIES; attempts++) {
      try {
        const response = await this.client.embeddings.create({
          input: batchTexts,
          model: model,
        })

        return {
          embeddings: response.data.map((item) => item.embedding),
          usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            totalTokens: response.usage?.total_tokens || 0,
          },
        }
      } catch (error: any) {
        if (error?.status === 429 && attempts < MAX_RETRIES - 1) {
          await new Promise((res) => setTimeout(res, INITIAL_DELAY_MS * Math.pow(2, attempts)))
          continue
        }
        logger.error('[{location}] Error creating embeddings: {error}', {
          error,
          location: 'OpenAICompatibleEmbedder._embedBatchWithRetries',
        })
        throw error
      }
    }
    throw new Error('Failed to generate OpenAI-compatible embeddings after retries')
  }

  async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await this.client.embeddings.create({
        input: ['test'],
        model: this.defaultModelId,
      })
      if (!response.data || response.data.length === 0) {
        return { valid: false, error: 'Invalid response from OpenAI-compatible endpoint' }
      }
      return { valid: true }
    } catch (error: any) {
      logger.error('[{location}] Error validating configuration: {error}', {
        error,
        location: 'OpenAICompatibleEmbedder.validateConfiguration',
      })
      return { valid: false, error: error?.message || String(error) }
    }
  }

  get embedderInfo(): EmbedderInfo {
    return { name: 'openai-compatible' }
  }
}
