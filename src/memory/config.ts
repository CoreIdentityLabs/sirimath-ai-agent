export interface MemoryConfig {
	neo4jUri: string | undefined;
	neo4jUser: string;
	neo4jPassword: string | undefined;
	memoryEmbeddings: "provider" | undefined;
	consolidationCron: string;
}

export function loadMemoryConfig(): MemoryConfig {
	const embeddings = process.env.MEMORY_EMBEDDINGS;
	return {
		neo4jUri: process.env.NEO4J_URI,
		neo4jUser: process.env.NEO4J_USER ?? "neo4j",
		neo4jPassword: process.env.NEO4J_PASSWORD,
		memoryEmbeddings: embeddings === "provider" ? "provider" : undefined,
		consolidationCron: process.env.MEMORY_CONSOLIDATION_CRON ?? "0 3 * * *",
	};
}
