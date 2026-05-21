import { createAzure } from "@ai-sdk/azure";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { type EmbeddingModel, embed, embedMany } from "ai";
import type { MemoryConfig } from "./config.js";

export interface MemoryEmbeddingProvider {
	generateEmbedding(text: string): Promise<number[]>;
	generateEmbeddingBatch(texts: string[]): Promise<number[][]>;
}

class AiSdkMemoryEmbeddingProvider implements MemoryEmbeddingProvider {
	constructor(private readonly model: EmbeddingModel) {}

	async generateEmbedding(text: string): Promise<number[]> {
		const { embedding } = await embed({ model: this.model, value: text });
		return embedding;
	}

	async generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
		if (texts.length === 0) return [];
		const { embeddings } = await embedMany({
			model: this.model,
			values: texts,
		});
		return embeddings;
	}
}

function requireEnv(name: string, provider: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(
			`[memory] Missing required environment variable: ${name} (required for MEMORY_EMBEDDING_PROVIDER=${provider})`,
		);
	}
	return value;
}

export async function resolveMemoryEmbeddingProvider(
	config: MemoryConfig,
): Promise<MemoryEmbeddingProvider | null> {
	if (config.memoryEmbeddings !== "provider") return null;

	const providerName =
		config.memoryEmbeddingProvider ?? process.env.MODEL_PROVIDER ?? "openai";
	const modelId = config.memoryEmbeddingModel;

	if (!modelId) {
		throw new Error(
			"[memory] MEMORY_EMBEDDING_MODEL is required when MEMORY_EMBEDDINGS=provider",
		);
	}

	switch (providerName) {
		case "openai": {
			requireEnv("OPENAI_API_KEY", "openai");
			return new AiSdkMemoryEmbeddingProvider(openai.embedding(modelId));
		}

		case "azure": {
			const resourceName = requireEnv("AZURE_RESOURCE_NAME", "azure");
			const apiKey = requireEnv("AZURE_API_KEY", "azure");
			const provider = createAzure({ resourceName, apiKey });
			return new AiSdkMemoryEmbeddingProvider(provider.embeddingModel(modelId));
		}

		case "lmstudio": {
			const provider = createOpenAICompatible({
				name: config.memoryEmbeddingProviderName ?? "lmstudio",
				baseURL:
					config.memoryEmbeddingBaseUrl ??
					process.env.LMSTUDIO_BASE_URL ??
					"http://localhost:1234/v1",
			});
			return new AiSdkMemoryEmbeddingProvider(provider.embeddingModel(modelId));
		}

		case "openai-compatible": {
			const baseURL =
				config.memoryEmbeddingBaseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL;
			if (!baseURL) {
				throw new Error(
					"[memory] MEMORY_EMBEDDING_BASE_URL or OPENAI_COMPATIBLE_BASE_URL is required for openai-compatible embeddings",
				);
			}
			const provider = createOpenAICompatible({
				name:
					config.memoryEmbeddingProviderName ??
					process.env.OPENAI_COMPATIBLE_NAME ??
					"openai-compatible",
				baseURL,
				apiKey:
					config.memoryEmbeddingApiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY,
			});
			return new AiSdkMemoryEmbeddingProvider(provider.embeddingModel(modelId));
		}

		default:
			throw new Error(
				`[memory] Unsupported MEMORY_EMBEDDING_PROVIDER: ${providerName}`,
			);
	}
}
