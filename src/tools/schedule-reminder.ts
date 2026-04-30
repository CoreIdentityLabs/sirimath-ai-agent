import { createTool } from "@voltagent/core";
import { monotonicFactory } from "ulid";
import { nextFireAtFromSchedule } from "../reminders/next-fire-at.js";
import { ScheduleReminderInputSchema } from "../reminders/schema.js";
import type { ReminderStore } from "../reminders/store.js";

const ulid = monotonicFactory();

export function createScheduleReminderTool(store: ReminderStore) {
	return createTool({
		name: "scheduleReminder",
		description:
			"Schedule a proactive reminder. Call AFTER the user confirms a reminder cadence for a task or follow-up.",
		parameters: ScheduleReminderInputSchema,
		execute: async (input) => {
			const id = ulid();
			const nextFireAt = nextFireAtFromSchedule(input, new Date());
			await store.insert({
				id,
				userIdentity: input.userIdentity,
				channelId: input.channelId,
				channelUserId: input.channelUserId,
				conversationId: input.conversationId,
				description: input.description,
				scheduleType: input.scheduleType,
				intervalMs: input.intervalMs ?? null,
				timeOfDay: input.timeOfDay ?? null,
				nextFireAt,
				status: "active",
				createdAt: new Date(),
			});
			return {
				reminderId: id,
				nextFireAt: nextFireAt.toISOString(),
				message: `Got it! I'll remind you about "${input.description}" — next check-in: ${nextFireAt.toLocaleString()}.`,
			};
		},
	});
}
