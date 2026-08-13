import { z } from 'zod/v4'
import { CodeIndexManager } from '../../manager'

export const ClearToolInputSchema = z.object({
  workspacePath: z
    .string()
    .optional()
    .meta({ description: 'Workspace folder path (defaults to current directory)' }),
})

export async function handleClearTool(input: z.infer<typeof ClearToolInputSchema>) {
  const manager = CodeIndexManager.getInstance(input.workspacePath)
  await manager.clearIndexData()

  return {
    content: [
      {
        type: 'text' as const,
        text: `Index data cleared successfully for workspace '${input.workspacePath || process.cwd()}'.`,
      },
    ],
  }
}
