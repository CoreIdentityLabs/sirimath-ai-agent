import { createTool } from "@voltagent/core";
import { ListRemindersInputSchema } from "../reminders/schema.js";
import type { ReminderStore } from "../reminders/store.js";

export function createListRemindersTool(store: ReminderStore) {
	return createTool({
		name: "listReminders",
		description:
			"List the user's active reminders. Call to show reminders or get a reminder ID before snoozing/dismissing.",
		parameters: ListRemindersInputSchema,
		execute: async ({ userIdentity, includeDelivered }) => {
			const reminders = await store.listForUser(userIdentity, includeDelivered);
			return {
				reminders: reminders.map((r) => ({
					id: r.id,
					description: r.description,
					scheduleType: r.scheduleType,
					nextFireAt: r.nextFireAt.toISOString(),
					lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
					deliveredCount: r.deliveredCount,
					status: r.status,
				})),
				count: reminders.length,
			};
		},
	});
}
