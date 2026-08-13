import { z } from 'zod/v4'
import { CodeIndexManager } from '../../manager'

export const StatusToolInputSchema = z.object({
  workspacePath: z
    .string()
    .optional()
    .meta({ description: 'Workspace folder path (defaults to current directory)' }),
})

export async function handleStatusTool(input: z.infer<typeof StatusToolInputSchema>) {
  const manager = CodeIndexManager.getInstance(input.workspacePath)
  const status = manager.getCurrentStatus()

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(status, null, 2),
      },
    ],
  }
}
