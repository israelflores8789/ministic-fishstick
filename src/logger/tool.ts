/**
 * Standardized way to report a failed tool call back to the MCP client
 * without crashing the server process. Tool failures are recoverable,
 * so they are surfaced via the MCP result's `isError: true` field per the
 * MCP spec's "Tool Execution Errors" mechanism.
 */

import type { CallToolResult } from '@modelcontextprotocol/server'
import { getAppLogger } from './setup'

const logger = getAppLogger(['tool'])

/**
 * Wraps a tool handler body. Catches any thrown error, logs it and returns a
 * well-formed MCP tool error result instead of letting the exception
 * propagate and kill the server.
 */
export async function runTool<T>(
  toolName: string,
  fn: () => Promise<T> | T,
  toSuccessResult: (value: T) => CallToolResult
): Promise<CallToolResult> {
  try {
    const value = await fn()
    return toSuccessResult(value)
  } catch (error) {
    return reportToolError(toolName, error)
  }
}

/**
 * Build an isError: true result and log the underlying cause. Never throws,
 * never touches stdout/stderr directly — safe to call from any tool handler
 * on the stdio transport.
 */
export function reportToolError(toolName: string, error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  logger.error('Tool {toolName} failed: {message}', { toolName, message, stack })

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Error in ${toolName}: ${message}`,
      },
    ],
  }
}
