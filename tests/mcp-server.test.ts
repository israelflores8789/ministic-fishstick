import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createMcpServer } from '../src/mcp/server'
import { CodeIndexManager } from '../src/core/manager'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

describe('MCP Server Tools', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'))
    await fs.writeFile(
      path.join(tmpDir, 'main.ts'),
      'function calculateTotal(items: number[]): number {\n  return items.reduce((a, b) => a + b, 0);\n}\n'
    )
    const manager = CodeIndexManager.getInstance(tmpDir)
    await manager.initialize()
  })

  afterEach(async () => {
    CodeIndexManager.disposeAll()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test('creates MCP server instance with registered tools', () => {
    const server = createMcpServer()
    expect(server).toBeDefined()
  })

  test('CodeIndexManager status reporting', () => {
    const manager = CodeIndexManager.getInstance(tmpDir)
    const status = manager.getCurrentStatus()
    expect(status.workspacePath).toBe(tmpDir)
    expect(status.systemStatus).toBe('Standby')
  })
})
