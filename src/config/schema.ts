import { z } from 'zod/v4'

export const EmbedderProviderSchema = z.enum([
  'openai',
  'ollama',
  'openai-compatible',
  'gemini',
  'mistral',
  'vercel-ai-gateway',
  'bedrock',
  'openrouter',
  'semble',
])

export type EmbedderProvider = z.infer<typeof EmbedderProviderSchema>

export const VectorStoreProviderSchema = z.enum(['sqlite', 'qdrant'])
export type VectorStoreProvider = z.infer<typeof VectorStoreProviderSchema>

export const FishstickConfigSchema = z.object({
  enabled: z.boolean().default(true),
  workspacePath: z.string().optional(),
  vectorStore: z
    .object({
      provider: VectorStoreProviderSchema.default('sqlite'),
      qdrantUrl: z.string().default('http://localhost:6333'),
      qdrantApiKey: z.string().optional(),
    })
    .default({}),
  embedder: z
    .object({
      provider: EmbedderProviderSchema.default('openai'),
      modelId: z.string().default('text-embedding-3-small'),
      modelDimension: z.number().positive().optional(),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      region: z.string().optional(),
      profile: z.string().optional(),
      specificProvider: z.string().optional(),
    })
    .default({}),
  search: z
    .object({
      minScore: z.number().min(0).max(1).default(0.3),
      maxResults: z.number().positive().default(20),
    })
    .default({}),
})

export type FishstickConfig = z.infer<typeof FishstickConfigSchema>
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}
