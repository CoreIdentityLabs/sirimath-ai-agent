import type { ChannelIdentityMapping } from "../schema.js";

export interface IdentityStore {
	resolveOrCreate(channel: string, channelUserId: string): Promise<string>;

	issuePairingCode(
		userIdentity: string,
		issuingChannel: string,
	): Promise<{ code: string; expiresAt: Date }>;

	consumePairingCode(
		newChannel: string,
		newChannelUserId: string,
		code: string,
	): Promise<
		| { ok: true; userIdentity: string }
		| { ok: false; reason: "expired" | "consumed" | "same_channel" | "unknown" }
	>;

	listChannels(userIdentity: string): Promise<ChannelIdentityMapping[]>;
}
