import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { FishIgnoreController } from '../src/ignore/fish-ignore'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

describe('FishIgnoreController', () => {
  let tmpDir: string
  let controller: FishIgnoreController

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fish-ignore-test-'))
    await fs.writeFile(path.join(tmpDir, '.gitignore'), 'ignored_by_git.txt\nbuild/\n')
    await fs.writeFile(path.join(tmpDir, '.fishignore'), 'secret.ts\n*.log\n')
    controller = new FishIgnoreController(tmpDir)
    await controller.initialize()
  })

  afterEach(async () => {
    controller.dispose()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test('respects .gitignore patterns', () => {
    expect(controller.validateAccess('ignored_by_git.txt')).toBe(false)
    expect(controller.validateAccess('build/output.js')).toBe(false)
    expect(controller.validateAccess('src/index.ts')).toBe(true)
  })

  test('respects .fishignore patterns', () => {
    expect(controller.validateAccess('secret.ts')).toBe(false)
    expect(controller.validateAccess('app.log')).toBe(false)
    expect(controller.validateAccess('src/app.ts')).toBe(true)
  })

  test('always ignores .fishignore and .git', () => {
    expect(controller.validateAccess('.fishignore')).toBe(false)
    expect(controller.validateAccess('.git/config')).toBe(false)
  })
})
