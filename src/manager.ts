import { VectorStoreSearchResult } from './interfaces'
import { IndexingState } from './interfaces/manager'
import { CodeIndexConfigManager } from './config/config-manager'
import { CodeIndexStateManager } from './state-manager'
import { CodeIndexServiceFactory } from './service-factory'
import { CodeIndexSearchService } from './search-service'
import { CodeIndexOrchestrator } from './orchestrator'
import { CacheManager } from './cache-manager'
import { FishIgnoreController } from './ignore/fish-ignore'
import fs from 'fs/promises'
import ignore from 'ignore'
import path from 'path'

export class CodeIndexManager {
  private static instances = new Map<string, CodeIndexManager>()

  private _configManager: CodeIndexConfigManager
  private readonly _stateManager: CodeIndexStateManager
  private _serviceFactory: CodeIndexServiceFactory | undefined
  private _orchestrator: CodeIndexOrchestrator | undefined
  private _searchService: CodeIndexSearchService | undefined
  private _cacheManager: CacheManager | undefined
  private readonly workspacePath: string

  public static getInstance(workspacePath: string = process.cwd()): CodeIndexManager {
    const resolvedPath = path.resolve(workspacePath)
    if (!CodeIndexManager.instances.has(resolvedPath)) {
      CodeIndexManager.instances.set(resolvedPath, new CodeIndexManager(resolvedPath))
    }
    return CodeIndexManager.instances.get(resolvedPath)!
  }

  public static disposeAll(): void {
    for (const instance of CodeIndexManager.instances.values()) {
      instance.dispose()
    }
    CodeIndexManager.instances.clear()
  }

  private constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this._stateManager = new CodeIndexStateManager()
    this._configManager = new CodeIndexConfigManager(workspacePath)
  }

  public get onProgressUpdate() {
    return this._stateManager.onProgressUpdate
  }

  public get state(): IndexingState {
    return this._orchestrator?.state || 'Standby'
  }

  public get isFeatureEnabled(): boolean {
    return this._configManager.isFeatureEnabled
  }

  public get configManager(): CodeIndexConfigManager {
    return this._configManager
  }

  public async initialize(): Promise<void> {
    if (!this._cacheManager) {
      this._cacheManager = new CacheManager(this.workspacePath)
      await this._cacheManager.initialize()
    }

    await this._recreateServices()
  }

  public async startIndexing(): Promise<void> {
    if (!this._orchestrator) {
      await this.initialize()
    }
    if (this._orchestrator) {
      await this._orchestrator.startIndexing()
    }
  }

  public stopIndexing(): void {
    this._orchestrator?.stopIndexing()
  }

  public stopWatcher(): void {
    this._orchestrator?.stopWatcher()
  }

  public async clearIndexData(): Promise<void> {
    if (this._orchestrator) {
      await this._orchestrator.clearIndexData()
    }
    if (this._cacheManager) {
      await this._cacheManager.clearCacheFile()
    }
  }

  public async searchIndex(
    query: string,
    directoryPrefix?: string
  ): Promise<VectorStoreSearchResult[]> {
    if (!this._searchService) {
      await this.initialize()
    }
    if (!this._searchService) {
      throw new Error('Search service not ready. Configure API key first.')
    }
    return this._searchService.searchIndex(query, directoryPrefix)
  }

  public getCurrentStatus() {
    const status = this._stateManager.getCurrentStatus()
    return {
      ...status,
      workspacePath: this.workspacePath,
      enabled: this.isFeatureEnabled,
    }
  }

  public dispose(): void {
    this.stopIndexing()
    if (this._cacheManager) {
      this._cacheManager.dispose()
    }
    this._stateManager.dispose()
  }

  private async _recreateServices(): Promise<void> {
    if (this._orchestrator) {
      this.stopWatcher()
    }

    this._serviceFactory = new CodeIndexServiceFactory(
      this._configManager,
      this.workspacePath,
      this._cacheManager!
    )

    const ignoreInstance = ignore()
    const gitignorePath = path.join(this.workspacePath, '.gitignore')
    try {
      const content = await fs.readFile(gitignorePath, 'utf8')
      ignoreInstance.add(content)
    } catch {
      // .gitignore optional
    }

    const fishIgnoreController = new FishIgnoreController(this.workspacePath)
    await fishIgnoreController.initialize()

    try {
      const { embedder, vectorStore, scanner, fileWatcher } = this._serviceFactory.createServices(
        this._cacheManager!,
        ignoreInstance,
        fishIgnoreController
      )

      this._orchestrator = new CodeIndexOrchestrator(
        this._configManager,
        this._stateManager,
        this.workspacePath,
        this._cacheManager!,
        vectorStore,
        scanner,
        fileWatcher
      )

      this._searchService = new CodeIndexSearchService(
        this._configManager,
        this._stateManager,
        embedder,
        vectorStore
      )

      this._stateManager.setSystemState('Standby', 'Ready.')
    } catch (error) {
      this._stateManager.setSystemState(
        'Standby',
        `Missing configuration: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
