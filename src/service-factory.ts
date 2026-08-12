import { Ignore } from "ignore"
import { OpenAiEmbedder } from "./embedders/openai"
import { CodeIndexOllamaEmbedder } from "./embedders/ollama"
import { OpenAICompatibleEmbedder } from "./embedders/openai-compatible"
import { GeminiEmbedder } from "./embedders/gemini"
import { MistralEmbedder } from "./embedders/mistral"
import { VercelAiGatewayEmbedder } from "./embedders/vercel-ai-gateway"
import { BedrockEmbedder } from "./embedders/bedrock"
import { OpenRouterEmbedder } from "./embedders/openrouter"
import { QdrantVectorStore } from "./vector-store/qdrant-client"
import { SQLiteVectorStore } from "./vector-store/sqlite-store"
import { codeParser, DirectoryScanner, FileWatcher } from "./processors"
import { ICodeParser, IEmbedder, IFileWatcher, IVectorStore } from "./interfaces"
import { CodeIndexConfigManager } from "./config/config-manager"
import { CacheManager } from "./cache-manager"
import { BATCH_SEGMENT_THRESHOLD } from "./constants"
import { getDefaultModelId, getModelDimension } from "./shared/embeddingModels"
import { FishIgnoreController } from "./ignore/fish-ignore"
import { t } from "./shared/i18n-shim"
import { TelemetryService, TelemetryEventName } from "./shared/telemetry-shim"

export class CodeIndexServiceFactory {
	constructor(
		private readonly configManager: CodeIndexConfigManager,
		private readonly workspacePath: string,
		private readonly cacheManager: CacheManager,
	) {}

	public createEmbedder(): IEmbedder {
		const config = this.configManager.getConfig()
		const provider = config.embedder.provider

		if (provider === "openai") {
			const apiKey = config.embedder.apiKey || process.env.OPENAI_API_KEY
			if (!apiKey) {
				throw new Error("OpenAI API key missing. Set OPENAI_API_KEY or configure in .fishstick.json")
			}
			return new OpenAiEmbedder({
				openAiNativeApiKey: apiKey,
				openAiEmbeddingModelId: config.embedder.modelId || "text-embedding-3-small",
			})
		} else if (provider === "ollama") {
			return new CodeIndexOllamaEmbedder({
				ollamaBaseUrl: config.embedder.baseUrl || "http://localhost:11434",
				ollamaModelId: config.embedder.modelId || "nomic-embed-text",
			})
		} else if (provider === "openai-compatible") {
			if (!config.embedder.baseUrl || !config.embedder.apiKey) {
				throw new Error("OpenAI compatible baseUrl and apiKey required.")
			}
			return new OpenAICompatibleEmbedder(
				config.embedder.baseUrl,
				config.embedder.apiKey,
				config.embedder.modelId,
			)
		} else if (provider === "gemini") {
			if (!config.embedder.apiKey) throw new Error("Gemini API key required.")
			return new GeminiEmbedder(config.embedder.apiKey, config.embedder.modelId)
		} else if (provider === "mistral") {
			if (!config.embedder.apiKey) throw new Error("Mistral API key required.")
			return new MistralEmbedder(config.embedder.apiKey, config.embedder.modelId)
		} else if (provider === "vercel-ai-gateway") {
			if (!config.embedder.apiKey) throw new Error("Vercel AI Gateway API key required.")
			return new VercelAiGatewayEmbedder(config.embedder.apiKey, config.embedder.modelId)
		} else if (provider === "bedrock") {
			if (!config.embedder.region) throw new Error("Bedrock AWS region required.")
			return new BedrockEmbedder(config.embedder.region, config.embedder.profile, config.embedder.modelId)
		} else if (provider === "openrouter") {
			if (!config.embedder.apiKey) throw new Error("OpenRouter API key required.")
			return new OpenRouterEmbedder(
				config.embedder.apiKey,
				config.embedder.modelId,
				undefined,
				config.embedder.specificProvider,
			)
		}

		throw new Error(`Unsupported embedder provider: ${provider}`)
	}

	public async validateEmbedder(embedder: IEmbedder): Promise<{ valid: boolean; error?: string }> {
		try {
			return await embedder.validateConfiguration()
		} catch (error) {
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				location: "validateEmbedder",
			})
			return {
				valid: false,
				error: error instanceof Error ? error.message : "Validation error",
			}
		}
	}

	public createVectorStore(): IVectorStore {
		const config = this.configManager.getConfig()
		const provider = config.embedder.provider
		const defaultModel = getDefaultModelId(provider as any) || "text-embedding-3-small"
		const modelId = config.embedder.modelId || defaultModel

		let vectorSize = getModelDimension(provider as any, modelId) || config.embedder.modelDimension || 1536

		if (config.vectorStore.provider === "sqlite") {
			return new SQLiteVectorStore(this.workspacePath, undefined, vectorSize)
		}

		if (!config.vectorStore.qdrantUrl) {
			throw new Error("Qdrant URL missing for qdrant vector store provider.")
		}

		return new QdrantVectorStore(this.workspacePath, config.vectorStore.qdrantUrl, vectorSize, config.vectorStore.qdrantApiKey)
	}

	public createDirectoryScanner(
		embedder: IEmbedder,
		vectorStore: IVectorStore,
		parser: ICodeParser,
		ignoreInstance: Ignore,
	): DirectoryScanner {
		return new DirectoryScanner(embedder, vectorStore, parser, this.cacheManager, ignoreInstance, BATCH_SEGMENT_THRESHOLD)
	}

	public createFileWatcher(
		embedder: IEmbedder,
		vectorStore: IVectorStore,
		cacheManager: CacheManager,
		ignoreInstance: Ignore,
		fishIgnoreController?: FishIgnoreController,
	): IFileWatcher {
		return new FileWatcher(
			this.workspacePath,
			cacheManager,
			embedder,
			vectorStore,
			ignoreInstance,
			fishIgnoreController,
			BATCH_SEGMENT_THRESHOLD,
		)
	}

	public createServices(
		cacheManager: CacheManager,
		ignoreInstance: Ignore,
		fishIgnoreController?: FishIgnoreController,
	): {
		embedder: IEmbedder
		vectorStore: IVectorStore
		parser: ICodeParser
		scanner: DirectoryScanner
		fileWatcher: IFileWatcher
	} {
		const embedder = this.createEmbedder()
		const vectorStore = this.createVectorStore()
		const parser = codeParser
		const scanner = this.createDirectoryScanner(embedder, vectorStore, parser, ignoreInstance)
		const fileWatcher = this.createFileWatcher(
			embedder,
			vectorStore,
			cacheManager,
			ignoreInstance,
			fishIgnoreController,
		)

		return {
			embedder,
			vectorStore,
			parser,
			scanner,
			fileWatcher,
		}
	}
}
