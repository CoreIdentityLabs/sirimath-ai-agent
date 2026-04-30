import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { MemoryStore } from "../ports/memory-store.js";

export function createMemoryExportTool(memoryStore: MemoryStore) {
	return createTool({
		name: "memoryExport",
		description:
			"Return the user's full remembered knowledge as a plain-text Markdown document they can keep.",
		parameters: z.object({}),
		execute: async (_input, options) => {
			return { markdown: await memoryStore.exportAll(options?.userId ?? "") };
		},
	});
}
