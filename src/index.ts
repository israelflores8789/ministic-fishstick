#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { createMcpServer } from './mcp/server'
import { CodeIndexManager } from './core/manager'
import { getAppLogger, getFatalLogger } from './logger'

const logger = getAppLogger()
const fatalLogger = getFatalLogger()

async function main() {
  const server = createMcpServer()
  const transport = new StdioServerTransport()

  // Initialize manager for current working directory
  const initialManager = CodeIndexManager.getInstance(process.cwd())
  await initialManager.initialize()

  await server.connect(transport)
  logger.info('MCP Server running on stdio')
}

main().catch((error) => {
  fatalLogger.fatal('Fatal server error: {error}', { error })
  process.exit(1)
})
