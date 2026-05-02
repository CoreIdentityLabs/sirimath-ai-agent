import { z } from "zod";

export const ScheduleTypeSchema = z.enum(["recurring", "daily", "once"]);
export type ScheduleType = z.infer<typeof ScheduleTypeSchema>;

export const ReminderStatusSchema = z.enum([
  "active",
  "delivering",
  "dismissed",
  "completed",
]);
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;

export const ReminderModeSchema = z.enum(["notify", "autonomous"]);
export type ReminderMode = z.infer<typeof ReminderModeSchema>;

export const ReminderToolPolicySchema = z.literal("all-interactive-tools");
export type ReminderToolPolicy = z.infer<typeof ReminderToolPolicySchema>;

export const BackgroundExecutionStatusSchema = z.enum([
  "scheduled",
  "running",
  "completed",
  "failed",
  "delivery-failed",
  "cancelled",
]);
export type BackgroundExecutionStatus = z.infer<
  typeof BackgroundExecutionStatusSchema
>;

export const ReminderSchema = z
  .object({
    id: z.string(),
    userIdentity: z.string(),
    channelId: z.string(),
    channelUserId: z.string(),
    conversationId: z.string(),
    description: z.string().min(1).max(1000),
    scheduleType: ScheduleTypeSchema,
    intervalMs: z.number().int().positive().nullable(),
    timeOfDay: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
    nextFireAt: z.coerce.date(),
    lastFiredAt: z.coerce.date().nullable(),
    deliveredCount: z.number().int().min(0),
    status: ReminderStatusSchema,
    mode: ReminderModeSchema.default("notify"),
    executionPrompt: z.string().min(1).max(4000).nullable(),
    toolPolicy: ReminderToolPolicySchema.default("all-interactive-tools"),
    createdAt: z.coerce.date(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "autonomous" && !value.executionPrompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "executionPrompt is required when mode is 'autonomous'",
        path: ["executionPrompt"],
      });
    }
  });
export type Reminder = z.infer<typeof ReminderSchema>;

export const BackgroundExecutionSchema = z.object({
  id: z.string(),
  reminderId: z.string(),
  userIdentity: z.string(),
  channelId: z.string(),
  channelUserId: z.string(),
  conversationId: z.string(),
  scheduledFor: z.coerce.date(),
  startedAt: z.coerce.date().nullable(),
  finishedAt: z.coerce.date().nullable(),
  status: BackgroundExecutionStatusSchema,
  dedupeKey: z.string().min(1),
  toolCallsJson: z.string().nullable(),
  resultText: z.string().nullable(),
  failureReason: z.string().nullable(),
  deliveryMessageId: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type BackgroundExecution = z.infer<typeof BackgroundExecutionSchema>;

export const ScheduleReminderInputSchema = z
  .object({
    userIdentity: z
      .string()
      .describe("The user's identity ULID from the memory system"),
    channelId: z
      .string()
      .describe("The channel the user is on (e.g. 'telegram')"),
    channelUserId: z.string().describe("The user's ID on that channel"),
    conversationId: z
      .string()
      .describe("The conversation/chat ID to reply into"),
    description: z
      .string()
      .min(1)
      .max(1000)
      .describe("What the reminder is about"),
    mode: ReminderModeSchema.default("notify").describe(
      "'notify' sends a reminder nudge only; 'autonomous' executes a background task",
    ),
    executionPrompt: z
      .string()
      .min(1)
      .max(4000)
      .optional()
      .describe(
        "Required for autonomous reminders: the full background task instruction",
      ),
    scheduleType: ScheduleTypeSchema.describe(
      "'recurring' for repeating intervals, 'daily' for same time every day, 'once' for a one-off",
    ),
    intervalMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "For 'recurring'/'daily': milliseconds between reminders (e.g. 21600000 = 6h)",
      ),
    timeOfDay: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .describe("For 'daily': time of day in HH:mm format (e.g. '09:00')"),
    fireAt: z
      .string()
      .datetime()
      .optional()
      .describe("For 'once': ISO 8601 datetime when to fire"),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "autonomous" && !value.executionPrompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "executionPrompt is required when mode is 'autonomous'",
        path: ["executionPrompt"],
      });
    }
  });
export type ScheduleReminderInput = z.infer<typeof ScheduleReminderInputSchema>;

export const SnoozeReminderInputSchema = z.object({
  reminderId: z.string().describe("The ULID of the reminder to snooze"),
  snoozeMs: z
    .number()
    .int()
    .positive()
    .default(3600000)
    .describe("Milliseconds to snooze (default 3600000 = 1 hour)"),
});

export const DismissReminderInputSchema = z.object({
  reminderId: z.string().describe("The ULID of the reminder to dismiss"),
  markCompleted: z
    .boolean()
    .default(false)
    .describe(
      "If true, marks as 'completed' (task done). If false, marks as 'dismissed' (no longer needed).",
    ),
});

export const ListRemindersInputSchema = z.object({
  userIdentity: z.string().describe("The user's identity ULID"),
  includeDelivered: z
    .boolean()
    .default(false)
    .describe(
      "If true, includes recently delivered reminders alongside active ones",
    ),
});

export const HeartbeatConfigSchema = z.object({
  userIdentity: z.string(),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  quietDays: z
    .array(
      z.enum([
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ]),
    )
    .nullable(),
  digestEnabled: z.boolean(),
  digestTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  digestChannelId: z.string().nullable(),
  updatedAt: z.coerce.date(),
});
export type HeartbeatConfig = z.infer<typeof HeartbeatConfigSchema>;

export const ConfigureHeartbeatInputSchema = z.object({
  userIdentity: z.string().describe("The user's identity ULID"),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .describe("Quiet hours start in HH:mm format (e.g. '22:00')"),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .describe("Quiet hours end in HH:mm format (e.g. '08:00')"),
  quietDays: z
    .array(
      z.enum([
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ]),
    )
    .optional()
    .describe("Days when reminders are suppressed (quiet days)"),
  digestEnabled: z
    .boolean()
    .optional()
    .describe("Enable daily digest instead of individual nudges"),
  digestTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .describe("Time for daily digest in HH:mm format"),
  digestChannelId: z
    .string()
    .optional()
    .describe("Channel ID for digest delivery"),
  reset: z
    .boolean()
    .optional()
    .describe(
      "If true, resets all heartbeat config to system defaults for this user",
    ),
});
