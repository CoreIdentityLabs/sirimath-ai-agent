import type { Tool } from "@voltagent/core";
import type { Logger } from "@voltagent/logger";
import type { LanguageModel } from "ai";
import type { Driver } from "neo4j-driver";
import type { MemoryConfig } from "./config.js";
import type { Consolidator } from "./ports/consolidator.js";
import type { IdentityStore } from "./ports/identity-store.js";
import type { MemoryStore } from "./ports/memory-store.js";
import { createNeo4jDriver } from "./store/neo4j/driver.js";
import { runMigrations } from "./store/neo4j/migrate.js";
import {
	noopConsolidator,
	noopIdentityStore,
	noopMemoryStore,
} from "./store/noop/stub.js";

export type { MemoryConfig } from "./config.js";
export { loadMemoryConfig } from "./config.js";
export type { IdentityStore } from "./ports/identity-store.js";
export type { MemoryStore } from "./ports/memory-store.js";
export type { Consolidator } from "./ports/consolidator.js";

export interface MemorySubsystem {
	identityStore: IdentityStore;
	memoryStore: MemoryStore;
	consolidator: Consolidator;
	driver: Driver | null;
	// biome-ignore lint/suspicious/noExplicitAny: tool generics are invariant across Zod schema variants
	tools: Tool<any, any>[];
	/** Stop scheduler (call on process shutdown). */
	stop(): void;
	/** Wrap an Agent with memory-awareness. In degraded mode, returns a thin wrapper that appends a degraded-mode footer. */
	wrap(agent: import("@voltagent/core").Agent): MemoryAwareAgentLike;
}

export interface MemoryAwareAgentLike {
	generateText(args: {
		input: string;
		channel: string;
		channelUserId: string;
		conversationId: string;
	}): Promise<{ text: string }>;
}

const DEGRADED_FOOTER = "\n\n⚠️ Long-term memory is temporarily unavailable.";

export async function createMemorySubsystem(
	cfg: MemoryConfig,
	log: Logger,
	model?: LanguageModel,
): Promise<MemorySubsystem> {
	const driver = await createNeo4jDriver(cfg, log);

	if (!driver) {
		// Degraded mode — return noop implementations
		// biome-ignore lint/suspicious/noExplicitAny: tool generics are invariant
		const tools: Tool<any, any>[] = [];
		return {
			identityStore: noopIdentityStore,
			memoryStore: noopMemoryStore,
			consolidator: noopConsolidator,
			driver: null,
			tools,
			stop() {},
			wrap(agent) {
				return {
					async generateText({ input, channelUserId, conversationId }) {
						const result = await agent.generateText(input, {
							userId: channelUserId,
							conversationId,
						});
						const text =
							typeof result === "string"
								? result
								: ((result as { text?: string }).text ?? String(result));
						return { text: text + DEGRADED_FOOTER };
					},
				};
			},
		};
	}

	await runMigrations(driver, cfg, log);

	// Lazy imports to avoid loading Neo4j-dependent modules when driver is null
	const [
		{ Neo4jIdentityStore },
		{ Neo4jMemoryStore },
		{ Neo4jConsolidator },
		{ createMemoryAwareAgent },
		{ createExtractor },
		{ startConsolidationScheduler },
		{ createMemorySearchTool },
		{ createMemoryViewProfileTool },
		{ createMemoryForgetTool },
		{ createMemoryExportTool },
		{ createMemoryEraseTool },
		{ createMemoryConsolidateTool },
		{ createMemoryChangesTool },
		{ createMemoryPairStartTool },
		{ createMemoryPairConfirmTool },
	] = await Promise.all([
		import("./store/neo4j/identity-store.js"),
		import("./store/neo4j/memory-store.js"),
		import("./store/neo4j/consolidator.js"),
		import("./agent-facade.js"),
		import("./extract/extractor.js"),
		import("./scheduler.js"),
		import("./tools/memory-search.tool.js"),
		import("./tools/memory-view-profile.tool.js"),
		import("./tools/memory-forget.tool.js"),
		import("./tools/memory-export.tool.js"),
		import("./tools/memory-erase.tool.js"),
		import("./tools/memory-consolidate.tool.js"),
		import("./tools/memory-changes.tool.js"),
		import("./tools/memory-pair-start.tool.js"),
		import("./tools/memory-pair-confirm.tool.js"),
	]);

	const identityStore = new Neo4jIdentityStore(driver, log);
	const memoryStore = new Neo4jMemoryStore(driver, log);
	const consolidator = model
		? new Neo4jConsolidator(driver, model, log)
		: noopConsolidator;

	let stopScheduler: () => void = () => {};
	if (model) {
		stopScheduler = startConsolidationScheduler(consolidator, log);
	}

	// biome-ignore lint/suspicious/noExplicitAny: tool generics are invariant across Zod schema variants
	const tools: Tool<any, any>[] = [
		createMemorySearchTool(memoryStore),
		createMemoryViewProfileTool(memoryStore),
		createMemoryForgetTool(memoryStore),
		createMemoryExportTool(memoryStore),
		createMemoryEraseTool(memoryStore),
		...(model ? [createMemoryConsolidateTool(consolidator)] : []),
		createMemoryChangesTool(memoryStore),
		createMemoryPairStartTool(identityStore),
		createMemoryPairConfirmTool(identityStore),
	];

	return {
		identityStore,
		memoryStore,
		consolidator,
		driver,
		tools,
		stop() {
			stopScheduler();
		},
		wrap(agent) {
			const extractor = model
				? createExtractor(model, log)
				: async () => ({ items: [], relationships: [] });
			return createMemoryAwareAgent({
				inner: agent,
				identity: identityStore,
				store: memoryStore,
				extract: extractor,
				log,
			});
		},
	};
}
