import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "@voltagent/logger";
import type { Driver } from "neo4j-driver";
import type { MemoryConfig } from "../../config.js";
import type { MemoryEmbeddingProvider } from "../../embedding-provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(
	driver: Driver,
	config: MemoryConfig,
	log: Logger,
	embeddingProvider?: MemoryEmbeddingProvider | null,
): Promise<void> {
	const cypher = readFileSync(join(__dirname, "migrations.cypher"), "utf-8");

	// Strip comment lines first so they don't interfere with statement splitting.
	// A comment-only segment preceding a real statement would otherwise be dropped
	// by the startsWith("//") filter, taking the statement with it.
	const cleaned = cypher
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("//"))
		.join("\n");

	const statements = cleaned
		.split(/;\s*\n/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	const session = driver.session();
	try {
		for (const statement of statements) {
			await session.executeWrite((tx) => tx.run(statement));
		}

		// Optional vector index migration
		if (config.memoryEmbeddings === "provider") {
			const dimensions =
				config.memoryEmbeddingDimensions ??
				(await (async () => {
					if (!embeddingProvider) return 1536;
					const sample =
						await embeddingProvider.generateEmbedding("memory probe");
					return sample.length || 1536;
				})());
			await session.executeWrite((tx) =>
				tx.run(
					`CREATE VECTOR INDEX memoryItemEmbedding IF NOT EXISTS
           FOR (m:MemoryItem) ON m.embedding
           OPTIONS { indexConfig: {
             \`vector.dimensions\`: ${dimensions},
             \`vector.similarity_function\`: 'cosine'
           } }`,
				),
			);
		}

		log.info("[memory] Neo4j migrations applied");
	} finally {
		await session.close();
	}
}
