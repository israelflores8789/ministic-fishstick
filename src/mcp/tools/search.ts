import { z } from 'zod/v4'
import { CodeIndexManager } from '../../manager'

export const SearchToolInputSchema = z.object({
  query: z.string().meta({ description: 'Semantic search query or code snippet to search for' }),
  directoryPrefix: z
    .string()
    .optional()
    .meta({
      description: "Optional relative directory path to restrict search (e.g. 'src/components')",
    }),
  workspacePath: z
    .string()
    .optional()
    .meta({ description: 'Workspace folder path (defaults to current process directory)' }),
})

export async function handleSearchTool(input: z.infer<typeof SearchToolInputSchema>) {
  const manager = CodeIndexManager.getInstance(input.workspacePath)
  const results = await manager.searchIndex(input.query, input.directoryPrefix)

  if (results.length === 0) {
    return {
      content: [{ type: 'text' as const, text: 'No relevant code blocks found for query.' }],
    }
  }

  const formatted = results
    .map((r, i) => {
      const p = r.payload
      const file = p?.filePath || 'unknown'
      const lines = p?.startLine && p?.endLine ? `:${p.startLine}-${p.endLine}` : ''
      const score = Math.round(r.score * 100) / 100
      return `### Result ${i + 1}: ${file}${lines} (Score: ${score})\n\`\`\`\n${p?.codeChunk || ''}\n\`\`\`\n`
    })
    .join('\n')

  return {
    content: [{ type: 'text' as const, text: formatted }],
  }
}
