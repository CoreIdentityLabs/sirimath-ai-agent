import type { Reminder, ScheduleReminderInput } from "./schema.js";

export function nextFireAtFromSchedule(
	input: Pick<
		ScheduleReminderInput,
		"scheduleType" | "intervalMs" | "timeOfDay" | "fireAt"
	>,
	now: Date,
): Date {
	switch (input.scheduleType) {
		case "recurring":
			return new Date(now.getTime() + (input.intervalMs ?? 3_600_000));
		case "daily": {
			const [hh, mm] = (input.timeOfDay ?? "09:00").split(":").map(Number);
			const next = new Date(now);
			next.setHours(hh, mm, 0, 0);
			if (next <= now) next.setDate(next.getDate() + 1);
			return next;
		}
		case "once":
			if (!input.fireAt) throw new Error("fireAt required for once schedule");
			return new Date(input.fireAt);
	}
}

export function advanceFireAt(
	reminder: Pick<
		Reminder,
		"scheduleType" | "nextFireAt" | "intervalMs" | "timeOfDay"
	>,
): Date {
	if (reminder.scheduleType === "once")
		throw new Error("Cannot advance a one-shot reminder");
	if (reminder.scheduleType === "daily" && reminder.timeOfDay) {
		const [hh, mm] = reminder.timeOfDay.split(":").map(Number);
		const next = new Date(reminder.nextFireAt);
		next.setDate(next.getDate() + 1);
		next.setHours(hh, mm, 0, 0);
		return next;
	}
	return new Date(
		reminder.nextFireAt.getTime() + (reminder.intervalMs ?? 3_600_000),
	);
}
