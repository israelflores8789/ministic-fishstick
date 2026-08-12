import fs from "fs"
import path from "path"
import os from "os"
import dotenv from "dotenv"
import { FishstickConfig, FishstickConfigSchema, EmbedderProvider, VectorStoreProvider, DeepPartial } from "./schema"

export class CodeIndexConfigManager {
	private workspacePath: string
	private runtimeOverrides: DeepPartial<FishstickConfig> = {}
	private currentConfig!: FishstickConfig

	constructor(workspacePath: string = process.cwd()) {
		this.workspacePath = workspacePath
		this.loadConfiguration()
	}

	public setWorkspacePath(wsPath: string) {
		this.workspacePath = wsPath
		this.loadConfiguration()
	}

	public getWorkspacePath(): string {
		return this.workspacePath
	}

	public loadConfiguration(): FishstickConfig {
		const envPath = path.join(this.workspacePath, ".env")
		if (fs.existsSync(envPath)) {
			dotenv.config({ path: envPath })
		}

		const envConfig = {
			enabled: process.env.CODE_INDEX_ENABLED !== "false",
			workspacePath: this.workspacePath,
			vectorStore: {
				provider: (process.env.VECTOR_STORE_PROVIDER as VectorStoreProvider) || "sqlite",
				qdrantUrl: process.env.QDRANT_URL || "http://localhost:6333",
				qdrantApiKey: process.env.QDRANT_API_KEY,
			},
			embedder: {
				provider: (process.env.EMBEDDER_PROVIDER as EmbedderProvider) || "openai",
				modelId: process.env.EMBEDDER_MODEL_ID || "text-embedding-3-small",
				apiKey:
					process.env.OPENAI_API_KEY ||
					process.env.GEMINI_API_KEY ||
					process.env.MISTRAL_API_KEY ||
					process.env.OPENROUTER_API_KEY,
				baseUrl: process.env.OLLAMA_BASE_URL || process.env.OPENAI_COMPATIBLE_BASE_URL,
				region: process.env.AWS_REGION || "us-east-1",
				profile: process.env.AWS_PROFILE,
			},
			search: {
				minScore: process.env.SEARCH_MIN_SCORE ? parseFloat(process.env.SEARCH_MIN_SCORE) : 0.3,
				maxResults: process.env.SEARCH_MAX_RESULTS ? parseInt(process.env.SEARCH_MAX_RESULTS, 10) : 20,
			},
		}

		let globalConfig = {}
		const globalConfigDir = path.join(os.homedir(), ".config", "fishstick")
		const globalConfigFile = path.join(globalConfigDir, "fishstick.json")
		if (fs.existsSync(globalConfigFile)) {
			try {
				const content = fs.readFileSync(globalConfigFile, "utf8")
				globalConfig = JSON.parse(content)
			} catch (err) {
				console.error("[ConfigManager] Error reading global config:", err)
			}
		}

		let workspaceConfig = {}
		const workspaceConfigFile = path.join(this.workspacePath, ".fishstick.json")
		if (fs.existsSync(workspaceConfigFile)) {
			try {
				const content = fs.readFileSync(workspaceConfigFile, "utf8")
				workspaceConfig = JSON.parse(content)
			} catch (err) {
				console.error("[ConfigManager] Error reading workspace config:", err)
			}
		}

		const mergedRaw = this.deepMerge(
			envConfig,
			globalConfig,
			workspaceConfig,
			this.runtimeOverrides,
		)

		this.currentConfig = FishstickConfigSchema.parse(mergedRaw)
		return this.currentConfig
	}

	public updateRuntimeOverrides(overrides: DeepPartial<FishstickConfig>) {
		this.runtimeOverrides = this.deepMerge(this.runtimeOverrides, overrides)
		this.loadConfiguration()
	}

	public getConfig(): FishstickConfig {
		return this.currentConfig
	}

	public get isFeatureEnabled(): boolean {
		return this.currentConfig.enabled
	}

	public get isFeatureConfigured(): boolean {
		const embedder = this.currentConfig.embedder
		if (embedder.provider === "openai") {
			return !!embedder.apiKey || !!process.env.OPENAI_API_KEY
		}
		if (embedder.provider === "ollama") {
			return !!embedder.baseUrl || true
		}
		if (embedder.provider === "semble") {
			return true
		}
		return !!embedder.apiKey
	}

	public get currentEmbedderProvider(): EmbedderProvider {
		return this.currentConfig.embedder.provider
	}

	public get vectorStoreProvider(): VectorStoreProvider {
		return this.currentConfig.vectorStore.provider
	}

	public get currentModelId(): string {
		return this.currentConfig.embedder.modelId
	}

	public get currentSearchMinScore(): number {
		return this.currentConfig.search.minScore
	}

	public get currentSearchMaxResults(): number {
		return this.currentConfig.search.maxResults
	}

	private deepMerge(...objects: any[]): any {
		const result: any = {}
		for (const obj of objects) {
			if (!obj) continue
			for (const key of Object.keys(obj)) {
				if (
					obj[key] &&
					typeof obj[key] === "object" &&
					!Array.isArray(obj[key])
				) {
					result[key] = this.deepMerge(result[key] || {}, obj[key])
				} else if (obj[key] !== undefined) {
					result[key] = obj[key]
				}
			}
		}
		return result
	}
}
