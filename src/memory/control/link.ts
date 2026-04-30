import type { IdentityStore } from "../ports/identity-store.js";

export async function startLink(
	userIdentity: string,
	channel: string,
	identityStore: IdentityStore,
): Promise<{ code: string; expiresAt: string; instructions: string }> {
	const { code, expiresAt } = await identityStore.issuePairingCode(
		userIdentity,
		channel,
	);
	return {
		code,
		expiresAt: expiresAt.toISOString(),
		instructions: `On the new channel, send: "/memory link ${code}" within 10 minutes.`,
	};
}

export async function confirmLink(
	channel: string,
	channelNativeId: string,
	code: string,
	identityStore: IdentityStore,
): Promise<
	{ ok: true; userIdentity: string } | { ok: false; message: string }
> {
	const result = await identityStore.consumePairingCode(
		channel,
		channelNativeId,
		code,
	);
	if (!result.ok) {
		// FR-028b: do not reveal whether a given identity exists
		return {
			ok: false,
			message: "That code is not valid. Please start a new pairing.",
		};
	}
	return { ok: true, userIdentity: result.userIdentity };
}
