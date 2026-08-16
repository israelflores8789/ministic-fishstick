import { McpServer } from '@modelcontextprotocol/server'
import { SearchToolInputSchema, handleSearchTool } from './tools/search'
import { StartIndexingToolInputSchema, handleStartIndexingTool } from './tools/index'
import { StatusToolInputSchema, handleStatusTool } from './tools/status'

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'ministic-fishstick',
    version: '0.1.0',
  })

  server.registerTool(
    'code_index_search',
    {
      description: 'Perform semantic vector search over the indexed codebase',
      inputSchema: SearchToolInputSchema,
    },
    async (args) => handleSearchTool(args)
  )

  server.registerTool(
    'code_index_start',
    {
      description: 'Start workspace scanning and file watching for code indexing',
      inputSchema: StartIndexingToolInputSchema,
    },
    async (args) => handleStartIndexingTool(args)
  )

  server.registerTool(
    'code_index_status',
    {
      description: 'Check indexing state, statistics, and file watcher progress',
      inputSchema: StatusToolInputSchema,
    },
    async (args) => handleStatusTool(args)
  )

  return server
}
