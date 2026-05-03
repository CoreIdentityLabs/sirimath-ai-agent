import { createTool } from "@voltagent/core";
import { monotonicFactory } from "ulid";
import { nextFireAtFromSchedule } from "../reminders/next-fire-at.js";
import { ScheduleReminderInputSchema } from "../reminders/schema.js";
import type { ReminderStore } from "../reminders/store.js";

const ulid = monotonicFactory();

type ScheduleReminderContext = {
  userIdentity: string;
  channelId: string;
  channelUserId: string;
  conversationId: string;
};

type ContextResolver = () => ScheduleReminderContext | null;

export function createScheduleReminderTool(
  store: ReminderStore,
  resolveContext?: ContextResolver,
) {
  return createTool({
    name: "scheduleReminder",
    description:
      "Schedule a proactive reminder. Call AFTER the user confirms a reminder cadence for a task or follow-up.",
    parameters: ScheduleReminderInputSchema,
    execute: async (input) => {
      const runtimeContext = resolveContext?.();
      const id = ulid();
      const nextFireAt = nextFireAtFromSchedule(input, new Date());
      const mode = input.mode ?? "notify";
      await store.insert({
        id,
        userIdentity: runtimeContext?.userIdentity ?? input.userIdentity,
        channelId: runtimeContext?.channelId ?? input.channelId,
        channelUserId: runtimeContext?.channelUserId ?? input.channelUserId,
        conversationId: runtimeContext?.conversationId ?? input.conversationId,
        description: input.description,
        scheduleType: input.scheduleType,
        intervalMs: input.intervalMs ?? null,
        timeOfDay: input.timeOfDay ?? null,
        nextFireAt,
        status: "active",
        mode,
        executionPrompt: input.executionPrompt ?? null,
        toolPolicy: "all-interactive-tools",
        createdAt: new Date(),
      });
      return {
        reminderId: id,
        nextFireAt: nextFireAt.toISOString(),
        message:
          mode === "autonomous"
            ? `Got it! I'll proactively handle "${input.description}" — next run: ${nextFireAt.toLocaleString()}.`
            : `Got it! I'll remind you about "${input.description}" — next check-in: ${nextFireAt.toLocaleString()}.`,
      };
    },
  });
}
