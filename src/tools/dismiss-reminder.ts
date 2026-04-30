import { createTool } from "@voltagent/core";
import { DismissReminderInputSchema } from "../reminders/schema.js";
import type { ReminderStore } from "../reminders/store.js";

export function createDismissReminderTool(store: ReminderStore) {
	return createTool({
		name: "dismissReminder",
		description:
			"Dismiss or mark a reminder as completed. Call when user says 'done', 'dismiss', or 'completed'.",
		parameters: DismissReminderInputSchema,
		execute: async ({ reminderId, markCompleted }) => {
			const status = markCompleted ? "completed" : "dismissed";
			await store.updateStatus(reminderId, status);
			return {
				reminderId,
				status,
				message: markCompleted
					? "Marked as completed. I won't remind you about this again."
					: "Reminder dismissed.",
			};
		},
	});
}
