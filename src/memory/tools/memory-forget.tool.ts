import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { MemoryStore } from "../ports/memory-store.js";

export function createMemoryForgetTool(memoryStore: MemoryStore) {
	return createTool({
		name: "memoryForget",
		description:
			'Forget a specific remembered item by its id or by a topic phrase. Use when the user says "forget that I use Stripe" or similar. Always presents a confirmation prompt before executing.',
		parameters: z
			.object({
				itemId: z.string().optional(),
				topic: z.string().optional(),
				confirm: z
					.boolean()
					.default(false)
					.describe("Set true only AFTER the user has confirmed."),
			})
			.refine((v) => v.itemId || v.topic, {
				message: "Either itemId or topic is required.",
			}),
		execute: async (input, options) => {
			const userIdentity = options?.userId ?? "";
			if (!input.confirm) {
				const candidates = input.itemId
					? [await memoryStore.attribute(userIdentity, input.itemId)]
					: await memoryStore.retrieve(userIdentity, input.topic ?? "", 3);
				return {
					pending: true,
					candidates,
					message:
						"Confirm deletion by calling memoryForget again with confirm=true and the chosen itemId.",
				};
			}
			if (!input.itemId) {
				return { error: "confirm=true requires a specific itemId." };
			}
			const { ok } = await memoryStore.forgetItem(userIdentity, input.itemId);
			return { ok, itemId: input.itemId };
		},
	});
}
