import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "@voltagent/logger";
import type { Driver } from "neo4j-driver";
import type { MemoryConfig } from "../../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(
	driver: Driver,
	config: MemoryConfig,
	log: Logger,
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
			await session.executeWrite((tx) =>
				tx.run(
					`CREATE VECTOR INDEX memoryItemEmbedding IF NOT EXISTS
           FOR (m:MemoryItem) ON m.embedding
           OPTIONS { indexConfig: {
             \`vector.dimensions\`: 1536,
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
