import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { IdentityStore } from "../ports/identity-store.js";

export function createMemoryPairStartTool(identityStore: IdentityStore) {
	return createTool({
		name: "memoryPairStart",
		description:
			"Generate a short-lived pairing code the user can type on another channel to merge that channel's identity with the current one.",
		parameters: z.object({}),
		execute: async (_input, options) => {
			const channel =
				(options?.context?.get("channel") as string | undefined) ?? "unknown";
			const { code, expiresAt } = await identityStore.issuePairingCode(
				options?.userId ?? "",
				channel,
			);
			return {
				code,
				expiresAt: expiresAt.toISOString(),
				instructions: `On the new channel, send: "/memory link ${code}" within the next 10 minutes.`,
			};
		},
	});
}
