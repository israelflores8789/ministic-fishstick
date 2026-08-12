#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from './mcp/server'
import { CodeIndexManager } from './manager'
import { logger } from './logger'

const log = logger('')

async function main() {
  const server = createMcpServer()
  const transport = new StdioServerTransport()

  // Initialize manager for current working directory
  const initialManager = CodeIndexManager.getInstance(process.cwd())
  await initialManager.initialize()

  await server.connect(transport)
  log.error('MCP Server running on stdio')
}

main().catch((err) => {
  log.error('Fatal server error:', err)
  process.exit(1)
})
