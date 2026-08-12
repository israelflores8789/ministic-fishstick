import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { CodeIndexConfigManager } from "../src/config/config-manager"
import fs from "fs/promises"
import path from "path"
import os from "os"

describe("CodeIndexConfigManager Tiered Configuration", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fishstick-config-test-"))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("loads defaults when no config files exist", () => {
    const configManager = new CodeIndexConfigManager(tmpDir)
    const config = configManager.getConfig()

    expect(config.enabled).toBe(true)
    expect(config.embedder.provider).toBe("openai")
    expect(config.embedder.modelId).toBe("text-embedding-3-small")
    expect(config.vectorStore.provider).toBe("sqlite")
    expect(config.search.minScore).toBe(0.3)
  })

  test("workspace .fishstick.json overrides defaults", async () => {
    const wsConfigPath = path.join(tmpDir, ".fishstick.json")
    await fs.writeFile(
      wsConfigPath,
      JSON.stringify({
        vectorStore: { provider: "qdrant" },
        search: { minScore: 0.7, maxResults: 50 },
      })
    )

    const configManager = new CodeIndexConfigManager(tmpDir)
    const config = configManager.getConfig()

    expect(config.vectorStore.provider).toBe("qdrant")
    expect(config.search.minScore).toBe(0.7)
    expect(config.search.maxResults).toBe(50)
  })

  test("runtime tool calls override file config", async () => {
    const configManager = new CodeIndexConfigManager(tmpDir)
    configManager.updateRuntimeOverrides({
      search: { minScore: 0.85, maxResults: 10 },
    })

    const config = configManager.getConfig()
    expect(config.search.minScore).toBe(0.85)
    expect(config.search.maxResults).toBe(10)
  })
})
