import { createTool } from "@voltagent/core";
import { SnoozeReminderInputSchema } from "../reminders/schema.js";
import type { ReminderStore } from "../reminders/store.js";

export function createSnoozeReminderTool(store: ReminderStore) {
	return createTool({
		name: "snoozeReminder",
		description:
			"Snooze a reminder. Call when the user says 'snooze' or 'remind me later'.",
		parameters: SnoozeReminderInputSchema,
		execute: async ({ reminderId, snoozeMs }) => {
			const until = new Date(Date.now() + snoozeMs);
			await store.snooze(reminderId, until);
			return {
				reminderId,
				newNextFireAt: until.toISOString(),
				message: `Snoozed! I'll remind you again at ${until.toLocaleString()}.`,
			};
		},
	});
}
