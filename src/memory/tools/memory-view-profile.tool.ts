import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { MemoryStore } from "../ports/memory-store.js";

export function createMemoryViewProfileTool(memoryStore: MemoryStore) {
	return createTool({
		name: "memoryViewProfile",
		description:
			'Return a concise summary of everything the system remembers about the current user. Use this when the user asks "what do you remember about me?" or a close paraphrase.',
		parameters: z.object({}),
		execute: async (_input, options) => {
			return await memoryStore.viewProfile(options?.userId ?? "");
		},
	});
}
