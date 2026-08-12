import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { SQLiteVectorStore } from '../src/vector-store/sqlite-store'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

describe('SQLiteVectorStore', () => {
  let tmpDir: string
  let store: SQLiteVectorStore

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sqlite-vec-test-'))
    store = new SQLiteVectorStore(tmpDir, tmpDir, 3)
    await store.initialize()
  })

  afterEach(async () => {
    await store.deleteCollection()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test('upserts points and searches with cosine similarity', async () => {
    await store.upsertPoints([
      {
        id: 'p1',
        vector: [1.0, 0.0, 0.0],
        payload: { filePath: 'src/a.ts', codeChunk: 'function a() {}', startLine: 1, endLine: 5 },
      },
      {
        id: 'p2',
        vector: [0.0, 1.0, 0.0],
        payload: { filePath: 'src/b.ts', codeChunk: 'function b() {}', startLine: 1, endLine: 5 },
      },
    ])

    const searchResults = await store.search([1.0, 0.1, 0.0], undefined, 0.5, 10)
    expect(searchResults.length).toBe(1)
    expect(searchResults[0].id).toBe('p1')
    expect(searchResults[0].score).toBeGreaterThan(0.9)
  })

  test('filters search by directory prefix', async () => {
    await store.upsertPoints([
      {
        id: 'p1',
        vector: [1.0, 0.0, 0.0],
        payload: { filePath: 'src/utils/a.ts', codeChunk: 'util', startLine: 1, endLine: 2 },
      },
      {
        id: 'p2',
        vector: [1.0, 0.0, 0.0],
        payload: { filePath: 'docs/readme.md', codeChunk: 'docs', startLine: 1, endLine: 2 },
      },
    ])

    const results = await store.search([1.0, 0.0, 0.0], 'src/utils', 0.1, 10)
    expect(results.length).toBe(1)
    expect(results[0].payload?.filePath).toBe('src/utils/a.ts')
  })

  test('tracks indexing completion status in metadata', async () => {
    expect(await store.hasIndexedData()).toBe(false)
    await store.markIndexingIncomplete()
    expect(await store.hasIndexedData()).toBe(false)
    await store.markIndexingComplete()
    expect(await store.hasIndexedData()).toBe(true)
  })
})
