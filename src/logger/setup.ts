/**
 * Logging architecture for ministic-fishstick
 *
 * Design:
 *  1. Normal operation writes NOTHING to stdout (would corrupt MCP's JSON-RPC
 *     framing on the stdio transport) and nothing to stderr either — debug/info/
 *     warning logs are buffered in memory via fingersCrossed() and only flushed
 *     to a rotating log file when a real problem occurs.
 *  2. FATAL errors (bad config, missing API key, Qdrant unreachable at startup,
 *     etc.) are the one exception: these prevent the server from running at
 *     all, so they are written LOUDLY to stderr (safe on stdio transport,
 *     unlike stdout) AND flushed to the log file, then the process exits.
 *  3. Tool-level failures during a running session never crash the process or
 *     write to stdio directly. They're logged (buffered/flushed per the normal
 *     rules) and reported to the MCP client via `isError: true` in the tool
 *     result, per the MCP spec's tool execution error mechanism.
 *  4. File rotation + cleanup is handled by LogTape's rotating file sink.
 */

import {
  configure,
  reset,
  fingersCrossed,
  getLogger,
  getConsoleSink,
  type Sink,
} from '@logtape/logtape'
import { getRotatingFileSink } from '@logtape/file'

export interface LoggingConfig {
  logDir: string
  logFileName: string
  maxFileSize?: number
  maxFiles?: number
  // Level at which buffered history + the record itself gets flushed.
  triggerLevel?: 'warning' | 'error' | 'fatal'
  // Levels below triggerLevel that get buffered instead of dropped.
  bufferLevel?: 'debug' | 'info'
  // How many buffered records to retain per isolated context/category.
  maxBufferSize?: number
}

const APP_CATEGORY = 'ministic-fishstick' as const

let configured = false

/**
 * Configure LogTape once at process startup, BEFORE the MCP server binds its
 * stdio transport. Returns the rotating file sink instance so callers can
 * force a flush during shutdown if desired.
 */
export async function setupLogging(config: LoggingConfig): Promise<void> {
  if (configured) return

  const {
    logDir,
    logFileName,
    maxFileSize = 1 * 1024 * 1024, // 1MB
    maxFiles = 3,
    triggerLevel = 'warning',
    bufferLevel = 'debug',
    maxBufferSize = 500,
  } = config

  const filePath = `${logDir}/${logFileName}`

  // Rotating sink: once a file exceeds maxFileSize it rolls to .1, .2, ... up
  // to maxFiles, and the oldest backup beyond maxFiles is deleted automatically.
  const rotatingFile: Sink = getRotatingFileSink(filePath, {
    maxSize: maxFileSize,
    maxFiles,
  })

  // Buffer everything below triggerLevel in memory; only flush to disk when
  // triggerLevel or above occurs (plus the buffered history leading up to it).
  // isolateByCategory keeps subsystems (qdrant / sqlite / embedding) from
  // flushing each other's unrelated buffered noise on an unrelated warning.
  const bufferedFile: Sink = fingersCrossed(rotatingFile, {
    triggerLevel,
    bufferLevel,
    maxBufferSize,
    isolateByCategory: 'descendant',
  })

  await configure({
    sinks: {
      file: bufferedFile,
      // Separate, UNBUFFERED sink reserved for fatal startup failures.
      // Fatals hit the file immediately, bypassing fingersCrossed.
      fatalFile: rotatingFile,
      console: getConsoleSink(), // only ever used for the fatal category below
    },
    loggers: [
      {
        category: [APP_CATEGORY],
        lowestLevel: 'debug',
        sinks: ['file'],
      },
      // LogTape's own internal meta-logger — keep it out of stdout/stderr too.
      {
        category: ['logtape', 'meta'],
        lowestLevel: 'warning',
        sinks: ['file'],
      },
      // Dedicated fatal category: writes immediately to both console (stderr)
      // and file, bypassing the fingers-crossed buffer entirely.
      {
        category: [APP_CATEGORY, 'fatal'],
        lowestLevel: 'fatal',
        sinks: ['console', 'fatalFile'],
      },
    ],
  })

  configured = true
}

/** Standard logger for a subsystem, e.g. getAppLogger(["qdrant"]). */
export function getAppLogger(subcategory: readonly string[] = []) {
  return getLogger([APP_CATEGORY, ...subcategory])
}

/** Dedicated logger for unrecoverable startup/config failures. */
export function getFatalLogger() {
  return getLogger([APP_CATEGORY, 'fatal'])
}

/**
 * Report a fatal error: log it loudly (console + file, immediately, no
 * buffering) and terminate the process. Use this ONLY for conditions that
 * make it impossible for the MCP server to run at all — bad config, missing
 * API keys, an unreachable Qdrant instance at startup, etc. This is distinct
 * from a tool execution failure during a live session, which must NOT crash
 * the process (see reportToolError in logger/tool.ts).
 */
export function crashFatal(message: string, error?: unknown): never {
  const logger = getFatalLogger()
  logger.fatal('{message} - {error}', {
    message,
    error: error instanceof Error ? (error.stack ?? error.message) : error,
  })

  // Even if the console sink somehow failed to flush synchronously, make
  // sure stderr definitely gets the message before exit.
  // (stderr, not stdout — writing to stdout would corrupt the MCP stdio
  // JSON-RPC stream.)
  process.stderr.write(
    `[FATAL] ministic-fishstick: ${message}${error ? ` — ${String(error)}` : ''}\n`
  )

  process.exit(1)
}

/** Call during graceful shutdown to release LogTape resources/sinks. */
export async function teardownLogging(): Promise<void> {
  await reset()
  configured = false
}
