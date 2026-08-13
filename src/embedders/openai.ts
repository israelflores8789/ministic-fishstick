import { OpenAI } from 'openai'
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from '../interfaces'
import {
  MAX_BATCH_TOKENS,
  MAX_ITEM_TOKENS,
  MAX_BATCH_RETRIES as MAX_RETRIES,
  INITIAL_RETRY_DELAY_MS as INITIAL_DELAY_MS,
} from '../constants'
import { getDefaultModelId, getModelQueryPrefix } from '../shared/embeddingModels'
import { t } from '../shared/i18n-shim'
import { TelemetryService, TelemetryEventName } from '../shared/telemetry-shim'


/**
 * OpenAi embedder implementation.
 * 
 * Supported Models:
 * - text-embedding-3-small: (dimension: 1536)
 * - text-embedding-3-large: (dimension: 3072)
 * - text-embedding-ada-002: (dimension: 1536)
 */
export class OpenAiEmbedder implements IEmbedder {
  private embeddingsClient: OpenAI
  private readonly defaultModelId: string

  constructor(options: { openAiNativeApiKey?: string; openAiEmbeddingModelId?: string }) {
    const apiKey = options.openAiNativeApiKey || process.env.OPENAI_API_KEY || 'not-provided'
    this.embeddingsClient = new OpenAI({ apiKey })
    this.defaultModelId = options.openAiEmbeddingModelId || getDefaultModelId('openai')
  }

  async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
    const modelToUse = model || this.defaultModelId
    const queryPrefix = getModelQueryPrefix('openai', modelToUse)
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
        const response = await this.embeddingsClient.embeddings.create({
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
        const hasMoreAttempts = attempts < MAX_RETRIES - 1
        if (error?.status === 429 && hasMoreAttempts) {
          const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempts)
          await new Promise((resolve) => setTimeout(resolve, delayMs))
          continue
        }

        TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
          error: error instanceof Error ? error.message : String(error),
          location: 'OpenAiEmbedder:_embedBatchWithRetries',
        })

        throw error
      }
    }

    throw new Error('Failed to generate OpenAI embeddings after retries')
  }

  async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await this.embeddingsClient.embeddings.create({
        input: ['test'],
        model: this.defaultModelId,
      })
      if (!response.data || response.data.length === 0) {
        return { valid: false, error: 'Invalid response from OpenAI API' }
      }
      return { valid: true }
    } catch (error: any) {
      return { valid: false, error: error?.message || String(error) }
    }
  }

  get embedderInfo(): EmbedderInfo {
    return { name: 'openai' }
  }
}
