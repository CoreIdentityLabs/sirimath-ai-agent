import { createTool } from "@voltagent/core";
import type { HeartbeatConfigStore } from "../reminders/heartbeat-config-store.js";
import { ConfigureHeartbeatInputSchema } from "../reminders/schema.js";

export function createConfigureHeartbeatTool(cfgStore: HeartbeatConfigStore) {
	return createTool({
		name: "configureHeartbeat",
		description:
			"Configure quiet hours, quiet days, and daily digest preferences for a user. Call when the user specifies when they want to receive reminders or sets up a daily digest.",
		parameters: ConfigureHeartbeatInputSchema,
		execute: async (input) => {
			if (input.reset) {
				await cfgStore.delete(input.userIdentity);
				return {
					userIdentity: input.userIdentity,
					message: "Heartbeat configuration reset to system defaults.",
				};
			}

			const existing = await cfgStore.get(input.userIdentity);
			const updated = {
				userIdentity: input.userIdentity,
				quietHoursStart:
					input.quietHoursStart ?? existing?.quietHoursStart ?? null,
				quietHoursEnd: input.quietHoursEnd ?? existing?.quietHoursEnd ?? null,
				quietDays: input.quietDays ?? existing?.quietDays ?? null,
				digestEnabled: input.digestEnabled ?? existing?.digestEnabled ?? false,
				digestTime: input.digestTime ?? existing?.digestTime ?? null,
				digestChannelId:
					input.digestChannelId ?? existing?.digestChannelId ?? null,
				updatedAt: new Date(),
			};

			await cfgStore.upsert(updated);

			const parts: string[] = [];
			if (updated.quietHoursStart && updated.quietHoursEnd) {
				parts.push(
					`Quiet hours: ${updated.quietHoursStart}–${updated.quietHoursEnd}`,
				);
			}
			if (updated.quietDays && updated.quietDays.length > 0) {
				parts.push(`Quiet days: ${updated.quietDays.join(", ")}`);
			}
			if (updated.digestEnabled && updated.digestTime) {
				parts.push(`Daily digest at ${updated.digestTime}`);
			}

			return {
				userIdentity: input.userIdentity,
				config: updated,
				message:
					parts.length > 0
						? `Updated! ${parts.join(". ")}.`
						: "Heartbeat configuration updated.",
			};
		},
	});
}
