import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { Consolidator } from "../ports/consolidator.js";

export function createMemoryConsolidateTool(consolidator: Consolidator) {
	return createTool({
		name: "memoryConsolidate",
		description:
			"Run a memory-maintenance pass now: merge duplicates, flag contradictions, prune stale items. Also callable on schedule.",
		parameters: z.object({}),
		execute: async (_input, options) => {
			const report = await consolidator.runOnce(options?.userId ?? "");
			return {
				summary: report.summary,
				merged: report.merged,
				pruned: report.pruned,
				supersessionsRecorded: report.supersessionsRecorded,
				contradictionsDetected: report.contradictionsDetected.length,
			};
		},
	});
}
