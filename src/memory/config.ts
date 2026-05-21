export interface MemoryConfig {
	neo4jUri: string | undefined;
	neo4jUser: string;
	neo4jPassword: string | undefined;
	memoryEmbeddings: "provider" | undefined;
	memoryEmbeddingProvider: string | undefined;
	memoryEmbeddingModel: string | undefined;
	memoryEmbeddingBaseUrl: string | undefined;
	memoryEmbeddingApiKey: string | undefined;
	memoryEmbeddingProviderName: string | undefined;
	memoryEmbeddingDimensions: number | undefined;
	consolidationCron: string;
}

export function loadMemoryConfig(): MemoryConfig {
	const embeddings = process.env.MEMORY_EMBEDDINGS;
	const embeddingDimensions = process.env.MEMORY_EMBEDDING_DIMENSIONS;
	return {
		neo4jUri: process.env.NEO4J_URI,
		neo4jUser: process.env.NEO4J_USER ?? "neo4j",
		neo4jPassword: process.env.NEO4J_PASSWORD,
		memoryEmbeddings: embeddings === "provider" ? "provider" : undefined,
		memoryEmbeddingProvider: process.env.MEMORY_EMBEDDING_PROVIDER,
		memoryEmbeddingModel: process.env.MEMORY_EMBEDDING_MODEL,
		memoryEmbeddingBaseUrl: process.env.MEMORY_EMBEDDING_BASE_URL,
		memoryEmbeddingApiKey: process.env.MEMORY_EMBEDDING_API_KEY,
		memoryEmbeddingProviderName: process.env.MEMORY_EMBEDDING_PROVIDER_NAME,
		memoryEmbeddingDimensions: embeddingDimensions
			? Number(embeddingDimensions)
			: undefined,
		consolidationCron: process.env.MEMORY_CONSOLIDATION_CRON ?? "0 3 * * *",
	};
}
