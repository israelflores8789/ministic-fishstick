import { McpServer } from '@modelcontextprotocol/server'
import { SearchToolInputSchema, handleSearchTool } from './tools/search'
import { StartIndexingToolInputSchema, handleStartIndexingTool } from './tools/index'
import { StatusToolInputSchema, handleStatusTool } from './tools/status'
import { ClearToolInputSchema, handleClearTool } from './tools/clear'
import { ConfigureToolInputSchema, handleConfigureTool } from './tools/configure'

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

  server.registerTool(
    'code_index_clear',
    {
      description: 'Clear index database and local cache for a workspace',
      inputSchema: ClearToolInputSchema,
    },
    async (args) => handleClearTool(args)
  )

  server.registerTool(
    'code_index_configure',
    {
      description: 'Dynamically update embedding provider or vector store settings',
      inputSchema: ConfigureToolInputSchema,
    },
    async (args) => handleConfigureTool(args)
  )

  return server
}
