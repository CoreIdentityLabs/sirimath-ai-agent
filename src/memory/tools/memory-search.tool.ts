import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { MemoryStore } from "../ports/memory-store.js";

export function createMemorySearchTool(memoryStore: MemoryStore) {
	return createTool({
		name: "memorySearch",
		description:
			"Search the user's long-term memory for items relevant to a topic. Use this when the user references something from earlier conversations that is not already visible in the current context.",
		parameters: z.object({
			query: z
				.string()
				.min(2)
				.describe("The topic or question to search memory for."),
			limit: z.number().int().min(1).max(20).default(8),
		}),
		execute: async ({ query, limit }, options) => {
			const userIdentity = options?.userId ?? "";
			const items = await memoryStore.retrieve(userIdentity, query, limit);
			return {
				items: items.map((i) => ({
					id: i.itemId,
					type: i.type,
					description: i.description,
					knownSince: i.validFrom.toISOString(),
					supersededAt: i.validUntil?.toISOString() ?? null,
				})),
			};
		},
	});
}
