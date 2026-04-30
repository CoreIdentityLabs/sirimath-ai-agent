import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { MemoryStore } from "../ports/memory-store.js";

export function createMemoryEraseTool(memoryStore: MemoryStore) {
	return createTool({
		name: "memoryErase",
		description:
			"Permanently erase ALL memory associated with the current user. Destructive. Always requires explicit confirmation.",
		parameters: z.object({
			confirm: z.boolean().default(false),
			confirmationPhrase: z
				.string()
				.optional()
				.describe('Exact phrase "erase my memory" to confirm.'),
		}),
		execute: async ({ confirm, confirmationPhrase }, options) => {
			if (
				!confirm ||
				confirmationPhrase?.trim().toLowerCase() !== "erase my memory"
			) {
				return {
					pending: true,
					message:
						'This will delete everything the assistant remembers about you. Reply "erase my memory" to confirm, or say "cancel".',
				};
			}
			const counts = await memoryStore.eraseAll(options?.userId ?? "");
			return { ok: true, ...counts };
		},
	});
}
