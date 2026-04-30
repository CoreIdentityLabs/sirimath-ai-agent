# Data Model: Heartbeat & Proactive Task Reminders

**Feature**: 006-heartbeat-proactive-reminders  
**Date**: 2026-04-30

---

## Entities

### Reminder

A scheduled notification linked to a follow-up item. Persisted in the `reminders` table in `reminders.db` (`.voltagent/reminders.db`).

| Field            | Type             | Description                                                                         |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `id`             | `ULID` (TEXT PK) | Unique identifier                                                                   |
| `userIdentity`   | TEXT NOT NULL    | Links to the identity in the memory subsystem                                       |
| `channelId`      | TEXT NOT NULL    | Adapter ID where the reminder was created (e.g. `"telegram"`)                       |
| `channelUserId`  | TEXT NOT NULL    | User's ID on that channel (e.g. Telegram `user.id`)                                 |
| `conversationId` | TEXT NOT NULL    | Chat/conversation ID to reply into proactively                                      |
| `description`    | TEXT NOT NULL    | Human-readable description of what to follow up on                                  |
| `scheduleType`   | TEXT NOT NULL    | `"recurring"` \| `"daily"` \| `"once"`                                              |
| `intervalMs`     | INTEGER NULL     | For `recurring` / `daily`: interval in milliseconds; `NULL` for `once`              |
| `timeOfDay`      | TEXT NULL        | For `daily`: `"HH:mm"` in 24-hour format; `NULL` otherwise                          |
| `nextFireAt`     | TEXT NOT NULL    | ISO 8601 timestamp — when the heartbeat should next fire this reminder              |
| `lastFiredAt`    | TEXT NULL        | ISO 8601 timestamp of the most recent delivery; `NULL` if never fired               |
| `deliveredCount` | INTEGER NOT NULL | Number of times this reminder has been delivered (default `0`)                      |
| `status`         | TEXT NOT NULL    | `"active"` \| `"delivering"` \| `"dismissed"` \| `"completed"` (default `"active"`) |
| `createdAt`      | TEXT NOT NULL    | ISO 8601 creation timestamp                                                         |

**Status transitions**:

```
active → delivering  (heartbeat claims it for delivery; guards against crash-duplicate)
delivering → active  (send exhausted retries; rolled back so next tick retries)
delivering → active  (heartbeat advances nextFireAt after successful recurring delivery)
delivering → completed (heartbeat marks once-type as completed after successful delivery)
active → dismissed   (user says "done" / "dismiss" / "ignore")
active → completed   (user says "done" with explicit completion intent)
```

One-shot (`scheduleType = "once"`) reminders transition to `completed` after the first delivery.

**Constraints**:

- `status IN ('active', 'delivering', 'dismissed', 'completed')`
- `scheduleType IN ('recurring', 'daily', 'once')`
- `intervalMs IS NOT NULL` when `scheduleType IN ('recurring', 'daily')`
- `timeOfDay IS NOT NULL` when `scheduleType = 'daily'` (format: `HH:mm`)

---

### HeartbeatConfig

Per-user global configuration for quiet hours and daily digest. One row per `userIdentity`.

| Field             | Type             | Description                                                                                  |
| ----------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `userIdentity`    | TEXT PK          | Links to memory subsystem identity                                                           |
| `quietHoursStart` | TEXT NULL        | `"HH:mm"` 24h — start of quiet window; `NULL` = no quiet hours                               |
| `quietHoursEnd`   | TEXT NULL        | `"HH:mm"` 24h — end of quiet window; `NULL` = no quiet hours                                 |
| `quietDays`       | TEXT NULL        | JSON array of lowercase weekday names e.g. `["saturday","sunday"]`; `NULL` = all days active |
| `digestEnabled`   | INTEGER NOT NULL | Boolean `0` or `1` (default `0`)                                                             |
| `digestTime`      | TEXT NULL        | `"HH:mm"` — daily digest send time; `NULL` if digest disabled                                |
| `digestChannelId` | TEXT NULL        | Channel to deliver digest on; defaults to the user's most recently active channel            |
| `updatedAt`       | TEXT NOT NULL    | ISO 8601 last-modified timestamp                                                             |

---

## SQLite DDL (migration, run against `reminders.db` at `.voltagent/reminders.db`)

```sql
CREATE TABLE IF NOT EXISTS reminders (
  id              TEXT    PRIMARY KEY,
  userIdentity    TEXT    NOT NULL,
  channelId       TEXT    NOT NULL,
  channelUserId   TEXT    NOT NULL,
  conversationId  TEXT    NOT NULL,
  description     TEXT    NOT NULL,
  scheduleType    TEXT    NOT NULL CHECK(scheduleType IN ('recurring','daily','once')),
  intervalMs      INTEGER,
  timeOfDay       TEXT,
  nextFireAt      TEXT    NOT NULL,
  lastFiredAt     TEXT,
  deliveredCount  INTEGER NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'active'
                          CHECK(status IN ('active','delivering','dismissed','completed')),
  createdAt       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminders_fire
  ON reminders (status, nextFireAt);

CREATE TABLE IF NOT EXISTS heartbeat_config (
  userIdentity     TEXT PRIMARY KEY,
  quietHoursStart  TEXT,
  quietHoursEnd    TEXT,
  quietDays        TEXT,
  digestEnabled    INTEGER NOT NULL DEFAULT 0,
  digestTime       TEXT,
  digestChannelId  TEXT,
  updatedAt        TEXT    NOT NULL
);
```

---

## Zod Schemas (TypeScript)

```typescript
// src/reminders/schema.ts

import { z } from "zod";

export const ScheduleTypeSchema = z.enum(["recurring", "daily", "once"]);
export type ScheduleType = z.infer<typeof ScheduleTypeSchema>;

export const ReminderStatusSchema = z.enum([
  "active",
  "dismissed",
  "completed",
]);
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;

export const ReminderSchema = z.object({
  id: z.string(), // ULID
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
  createdAt: z.coerce.date(),
});
export type Reminder = z.infer<typeof ReminderSchema>;

// Tool input schemas

export const ScheduleReminderInputSchema = z.object({
  userIdentity: z
    .string()
    .describe("The user's identity ULID from the memory system"),
  channelId: z
    .string()
    .describe("The channel the user is on (e.g. 'telegram')"),
  channelUserId: z.string().describe("The user's ID on that channel"),
  conversationId: z.string().describe("The conversation/chat ID to reply into"),
  description: z
    .string()
    .min(1)
    .max(1000)
    .describe("What the reminder is about"),
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
```

---

## State Transitions Diagram

```
                  scheduleReminder tool called
                          │
                          ▼
                    ┌───────────┐
                    │  active   │◄──────────────────────────┐
                    └─────┬─────┘                           │
                          │                                 │
              ┌───────────┼──────────────┐                  │
              │           │              │                  │
        heartbeat     user: "snooze"   user: "done"/     user: "snooze"
          fires           │            "dismiss"               │
              │           ▼              │                  │
              │    ┌────────────┐        │                  │
              │    │  (snoozed) │────────┼──────────────────┘
              │    │ nextFireAt │    based on                nextFireAt
              │    │ advanced   │    markCompleted           = now + snoozeMs
              │    └────────────┘        │
              │                         ▼
              │              ┌─────────────────────┐
              │              │  dismissed/completed │
              │              └─────────────────────┘
              │
        ┌─────▼────────────────────────────────────┐
        │  Deliver via ChannelAdapter               │
        │  • Update nextFireAt += intervalMs        │
        │  • deliveredCount++                       │
        │  • one-shot → status = 'completed'        │
        └───────────────────────────────────────────┘
```
