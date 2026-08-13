import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { fromIni, fromNodeProviderChain } from '@aws-sdk/credential-providers'
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from '../interfaces'
import { MAX_BATCH_RETRIES as MAX_RETRIES } from '../constants'
import { TelemetryService, TelemetryEventName } from '../shared/telemetry-shim'
import { getDefaultModelId } from '../shared/embeddingModels'
import { name, version } from '../../package.json'

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

  constructor(
    private readonly region: string,
    private readonly profile?: string,
    modelId?: string
  ) {
    if (!region) {
      throw new Error('Region is required for AWS Bedrock embedder')
    }

    const credentials = this.profile ? fromIni({ profile: this.profile }) : fromNodeProviderChain()

    this.bedrockClient = new BedrockRuntimeClient({
      userAgentAppId: `${name}#${version}`,
      region: this.region,
      credentials,
    })
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
