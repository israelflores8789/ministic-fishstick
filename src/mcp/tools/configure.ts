import { z } from 'zod/v4'
import { CodeIndexManager } from '../../manager'
import { EmbedderProviderSchema, VectorStoreProviderSchema } from '../../config/schema'

export const ConfigureToolInputSchema = z.object({
  workspacePath: z
    .string()
    .optional()
    .describe('Workspace folder path (defaults to current directory)'),
  embedderProvider: EmbedderProviderSchema.optional().describe(
    'Embedding provider (openai, ollama, gemini, etc.)'
  ),
  embedderModelId: z
    .string()
    .optional()
    .describe('Embedding model ID (e.g. text-embedding-3-small)'),
  vectorStoreProvider: VectorStoreProviderSchema.optional().describe(
    "Vector store provider ('sqlite' or 'qdrant')"
  ),
  qdrantUrl: z.string().optional().describe('Qdrant server URL if using qdrant'),
  minScore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Minimum search similarity score threshold (0.0 - 1.0)'),
  maxResults: z.number().positive().optional().describe('Maximum search results to return'),
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
