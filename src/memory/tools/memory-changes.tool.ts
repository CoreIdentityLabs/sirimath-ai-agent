import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { MemoryStore } from "../ports/memory-store.js";

export function createMemoryChangesTool(memoryStore: MemoryStore) {
	return createTool({
		name: "memoryChanges",
		description:
			'Return a summary of the most recent consolidation passes. Use when the user asks "what changed in memory?".',
		parameters: z.object({
			limit: z.number().int().min(1).max(10).default(3),
		}),
		execute: async ({ limit }, options) => {
			const reports = await memoryStore.listConsolidationReports(
				options?.userId ?? "",
				limit,
			);
			return {
				reports: reports.map((r) => ({
					ranAt: r.ranAt.toISOString(),
					summary: r.summary,
					merged: r.merged,
					pruned: r.pruned,
				})),
			};
		},
	});
}
