#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from './mcp/server'
import { CodeIndexManager } from './manager'

async function main() {
  const server = createMcpServer()
  const transport = new StdioServerTransport()

  // Initialize manager for current working directory
  const initialManager = CodeIndexManager.getInstance(process.cwd())
  await initialManager.initialize()

  await server.connect(transport)
  console.error('[ministic-fishstick] MCP Server running on stdio')
}

main().catch((err) => {
  console.error('[ministic-fishstick] Fatal server error:', err)
  process.exit(1)
})
