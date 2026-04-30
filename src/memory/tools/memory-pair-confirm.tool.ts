import { createTool } from "@voltagent/core";
import { z } from "zod";
import type { IdentityStore } from "../ports/identity-store.js";

export function createMemoryPairConfirmTool(identityStore: IdentityStore) {
	return createTool({
		name: "memoryPairConfirm",
		description:
			"Redeem a pairing code received on another channel. Must be called from the NEW channel, not from the channel that issued the code.",
		parameters: z.object({
			code: z.string().regex(/^[A-Z0-9]{6}$/),
		}),
		execute: async ({ code }, options) => {
			const channel =
				(options?.context?.get("channel") as string | undefined) ?? "unknown";
			const channelNativeId =
				(options?.context?.get("channelNativeId") as string | undefined) ?? "";

			const result = await identityStore.consumePairingCode(
				channel,
				channelNativeId,
				code,
			);
			if (!result.ok) {
				// FR-028b: do not leak whether a given user identity exists.
				return {
					ok: false,
					message: "That code is not valid. Please start a new pairing.",
				};
			}
			return {
				ok: true,
				message:
					"Channels linked. Your memory on this channel now matches your other one.",
			};
		},
	});
}
