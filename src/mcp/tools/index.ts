import { z } from 'zod'
import { CodeIndexManager } from '../../manager'

export const StartIndexingToolInputSchema = z.object({
  workspacePath: z
    .string()
    .optional()
    .describe('Workspace folder path to index (defaults to current directory)'),
})

export async function handleStartIndexingTool(input: z.infer<typeof StartIndexingToolInputSchema>) {
  const manager = CodeIndexManager.getInstance(input.workspacePath)
  await manager.initialize()
  // Background non-blocking trigger
  manager.startIndexing().catch((err) => {
    console.error('[MCP] Start indexing error:', err)
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
