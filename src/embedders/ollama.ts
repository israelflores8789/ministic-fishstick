import { EmbedderInfo, EmbeddingResponse, IEmbedder } from '../interfaces'
import { getDefaultModelId, getModelQueryPrefix } from '../shared/embeddingModels'
import { MAX_ITEM_TOKENS } from '../constants'
import { TelemetryService, TelemetryEventName } from '../shared/telemetry-shim'

const OLLAMA_EMBEDDING_TIMEOUT_MS = 60000

/**
 * Ollama Embedder implementation for creating embeddings using the Ollama API.
 *
 * Supported models:
 *
 * - nomic-embed-text: (dimension: 768)
 * - nomic-embed-code: (dimension: 3584)
 * - mxbai-embed-large: (dimension: 1024)
 * - all-minilm: (dimension: 384)
 * - qwen3-embedding:0.6b: (dimension: 1024)
 * - qwen3-embedding:4b: (dimension: 2560)
 * - qwen3-embedding:8b: (dimension: 4096)
 */
export class CodeIndexOllamaEmbedder implements IEmbedder {
  private readonly baseUrl: string
  private readonly defaultModelId: string

  constructor(options: { ollamaBaseUrl?: string; ollamaModelId?: string }) {
    let baseUrl = options.ollamaBaseUrl || 'http://localhost:11434'
    baseUrl = baseUrl.replace(/\/+$/, '')
    this.baseUrl = baseUrl
    this.defaultModelId = options.ollamaModelId || getDefaultModelId('ollama')
  }

  async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
    const modelToUse = model || this.defaultModelId
    const url = `${this.baseUrl}/api/embed`

    const queryPrefix = getModelQueryPrefix('ollama', modelToUse)
    const processedTexts = queryPrefix
      ? texts.map((text) => (text.startsWith(queryPrefix) ? text : `${queryPrefix}${text}`))
      : texts

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), OLLAMA_EMBEDDING_TIMEOUT_MS)

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelToUse, input: processedTexts }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Ollama request failed with status ${response.status}`)
      }

      const data = await response.json()
      const embeddings = data.embeddings
      if (!embeddings || !Array.isArray(embeddings)) {
        throw new Error('Invalid response structure from Ollama')
      }

      return { embeddings }
    } catch (error: any) {
      TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
        error: error instanceof Error ? error.message : String(error),
        location: 'OllamaEmbedder:createEmbeddings',
      })
      throw new Error(`Ollama embedding failed: ${error.message}`)
    }
  }

  async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
    try {
      const modelsUrl = `${this.baseUrl}/api/tags`
      const response = await fetch(modelsUrl)
      if (!response.ok) {
        return { valid: false, error: `Ollama service returned ${response.status}` }
      }
      return { valid: true }
    } catch (error: any) {
      return { valid: false, error: error?.message || 'Ollama service unavailable' }
    }
  }

  get embedderInfo(): EmbedderInfo {
    return { name: 'ollama' }
  }
}
