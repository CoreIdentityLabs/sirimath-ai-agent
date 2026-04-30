# Contract: Reminder Tools

**Feature**: 006-heartbeat-proactive-reminders  
**Module**: `src/tools/` (one file per tool)

---

## scheduleReminder

**File**: `src/tools/schedule-reminder.ts`  
**Tool name**: `scheduleReminder`

Called by the agent immediately after the user confirms a reminder cadence.

### Input Schema

```typescript
z.object({
  userIdentity: z.string(),
  channelId: z.string(),
  channelUserId: z.string(),
  conversationId: z.string(),
  description: z.string().min(1).max(1000),
  scheduleType: z.enum(["recurring", "daily", "once"]),
  intervalMs: z.number().int().positive().optional(), // required for recurring/daily
  timeOfDay: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(), // required for daily
  fireAt: z.string().datetime().optional(), // required for once
});
```

### Output Schema

```typescript
z.object({
  reminderId: z.string(),
  nextFireAt: z.string(), // ISO 8601
  message: z.string(), // human-readable confirmation
});
```

### Behaviour

1. Validate that required fields are present for the given `scheduleType`.
2. Compute `nextFireAt` using `nextFireAtFromSchedule(input, new Date())`.
3. Insert a new row into `reminders` with `status = 'active'`.
4. Return `reminderId` and a confirmation string.

---

## snoozeReminder

**File**: `src/tools/snooze-reminder.ts`  
**Tool name**: `snoozeReminder`

Called by the agent when the user replies to a reminder with snooze intent.

### Input Schema

```typescript
z.object({
  reminderId: z.string(),
  snoozeMs: z.number().int().positive().default(3600000),
});
```

### Output Schema

```typescript
z.object({
  reminderId: z.string(),
  newNextFireAt: z.string(), // ISO 8601
  message: z.string(),
});
```

### Behaviour

1. Look up the reminder by ID; throw if not found or not `active`.
2. Set `nextFireAt = now + snoozeMs`.
3. Persist the updated row.
4. Return confirmation with the new fire time.

---

## dismissReminder

**File**: `src/tools/dismiss-reminder.ts`  
**Tool name**: `dismissReminder`

Called by the agent when the user marks a reminder as done or dismissed.

### Input Schema

```typescript
z.object({
  reminderId: z.string(),
  markCompleted: z.boolean().default(false),
});
```

### Output Schema

```typescript
z.object({
  reminderId: z.string(),
  status: z.enum(["dismissed", "completed"]),
  message: z.string(),
});
```

### Behaviour

1. Look up the reminder; throw if not found.
2. Update `status` to `"completed"` if `markCompleted = true`, else `"dismissed"`.
3. Persist the updated row.
4. Return the new status and a confirmation string.

---

## listReminders

**File**: `src/tools/list-reminders.ts`  
**Tool name**: `listReminders`

Called by the agent to retrieve the user's pending reminders (e.g., when user says "show my reminders" or when the agent needs the most recent reminder ID for snooze/dismiss).

### Input Schema

```typescript
z.object({
  userIdentity: z.string(),
  includeDelivered: z.boolean().default(false),
});
```

### Output Schema

```typescript
z.object({
  reminders: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      scheduleType: z.string(),
      nextFireAt: z.string(),
      lastFiredAt: z.string().nullable(),
      deliveredCount: z.number(),
      status: z.string(),
    }),
  ),
  count: z.number(),
});
```

### Behaviour

1. Query `reminders` for `userIdentity` where `status = 'active'` (plus recently delivered if `includeDelivered = true`).
2. Return sorted by `nextFireAt ASC`.
3. Limit to 50 rows to prevent huge payloads.
