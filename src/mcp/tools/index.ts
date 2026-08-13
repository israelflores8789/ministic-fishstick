import { z } from 'zod/v4'
import { CodeIndexManager } from '../../manager'
import { getAppLogger } from '../../logger'

const logger = getAppLogger(['mcp'])

export const StartIndexingToolInputSchema = z.object({
  workspacePath: z
    .string()
    .optional()
    .meta({ description: 'Workspace folder path to index (defaults to current directory)' }),
})

export async function handleStartIndexingTool(input: z.infer<typeof StartIndexingToolInputSchema>) {
  const manager = CodeIndexManager.getInstance(input.workspacePath)
  await manager.initialize()
  // Background non-blocking trigger
  manager.startIndexing().catch((error) => {
    logger.error('[{location}] Start indexing error: {error}', {
      error,
      location: 'MCP:handleStartIndexingTool',
    })
  })

  const status = manager.getCurrentStatus()
  return {
    content: [
      {
        type: 'text' as const,
        text: `Indexing initiated for workspace '${status.workspacePath}'. Current status: ${status.systemStatus} (${status.message})`,
      },
    ],
  }
}
