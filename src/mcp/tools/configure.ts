import { z } from 'zod/v4'
import { CodeIndexManager } from '../../manager'
import { EmbedderProviderSchema, VectorStoreProviderSchema } from '../../config/schema'

export const ConfigureToolInputSchema = z.object({
  workspacePath: z
    .string()
    .optional()
    .meta({ description: 'Workspace folder path (defaults to current directory)' }),
  embedderProvider: EmbedderProviderSchema.optional().meta({
    description: 'Embedding provider (openai, ollama, gemini, etc.)',
  }),
  embedderModelId: z
    .string()
    .optional()
    .meta({ description: 'Embedding model ID (e.g. text-embedding-3-small)' }),
  vectorStoreProvider: VectorStoreProviderSchema.optional().meta({
    description: "Vector store provider ('sqlite' or 'qdrant')",
  }),
  qdrantUrl: z.string().optional().meta({ description: 'Qdrant server URL if using qdrant' }),
  minScore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .meta({ description: 'Minimum search similarity score threshold (0.0 - 1.0)' }),
  maxResults: z
    .number()
    .positive()
    .optional()
    .meta({ description: 'Maximum search results to return' }),
})

export async function handleConfigureTool(input: z.infer<typeof ConfigureToolInputSchema>) {
  const manager = CodeIndexManager.getInstance(input.workspacePath)

  const embedderOverride =
    input.embedderProvider || input.embedderModelId
      ? {
          ...(input.embedderProvider && { provider: input.embedderProvider }),
          ...(input.embedderModelId && { modelId: input.embedderModelId }),
        }
      : undefined

  const vectorStoreOverride =
    input.vectorStoreProvider || input.qdrantUrl
      ? {
          ...(input.vectorStoreProvider && { provider: input.vectorStoreProvider }),
          ...(input.qdrantUrl && { qdrantUrl: input.qdrantUrl }),
        }
      : undefined

  const searchOverride =
    input.minScore !== undefined || input.maxResults !== undefined
      ? {
          ...(input.minScore !== undefined && { minScore: input.minScore }),
          ...(input.maxResults !== undefined && { maxResults: input.maxResults }),
        }
      : undefined

  manager.configManager.updateRuntimeOverrides({
    ...(embedderOverride && { embedder: embedderOverride as any }),
    ...(vectorStoreOverride && { vectorStore: vectorStoreOverride as any }),
    ...(searchOverride && { search: searchOverride }),
  })

  await manager.initialize()

  return {
    content: [
      {
        type: 'text' as const,
        text: `Configuration updated successfully: ${JSON.stringify(manager.configManager.getConfig(), null, 2)}`,
      },
    ],
  }
}
