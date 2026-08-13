import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from '../interfaces'
import { MAX_BATCH_RETRIES as MAX_RETRIES } from '../constants'
import { TelemetryService, TelemetryEventName } from '../shared/telemetry-shim'
import { getDefaultModelId } from '../shared/embeddingModels'

/**
 * Bedrock embedder implementation.
 *
 * Supported models:
 * - amazon.titan-embed-text-v: (dimension: 1536)
 * - amazon.titan-embed-text-v2:0: (dimension: 1024)
 * - amazon.titan-embed-image-v1: (dimension: 1024)
 * - amazon.nova-2-multimodal-embeddings-v1:0: (dimension: 3072)
 * - cohere.embed-v4:0: (dimension: 1536)
 * - cohere.embed-english-v3: (dimension: 1024)
 * - cohere.embed-multilingual-v3: (dimension: 1024)
 */
export class BedrockEmbedder implements IEmbedder {
  private bedrockClient: BedrockRuntimeClient
  private readonly defaultModelId: string

  constructor(region: string, profile?: string, modelId?: string) {
    this.bedrockClient = new BedrockRuntimeClient({ region })
    this.defaultModelId = modelId || getDefaultModelId('bedrock')
  }

  async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
    const modelToUse = model || this.defaultModelId
    const embeddings: number[][] = []

    for (const text of texts) {
      const command = new InvokeModelCommand({
        modelId: modelToUse,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({ inputText: text }),
      })

      try {
        const response = await this.bedrockClient.send(command)
        const responseBody = JSON.parse(new TextDecoder().decode(response.body))
        if (responseBody.embedding) {
          embeddings.push(responseBody.embedding)
        }
      } catch (error) {
        TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
          error: error instanceof Error ? error.message : String(error),
          location: 'BedrockEmbedder:createEmbeddings',
        })
        throw error
      }
    }

    return { embeddings }
  }

  async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.createEmbeddings(['test'])
      return { valid: true }
    } catch (error: any) {
      return { valid: false, error: error?.message || String(error) }
    }
  }

  get embedderInfo(): EmbedderInfo {
    return { name: 'bedrock' }
  }
}
