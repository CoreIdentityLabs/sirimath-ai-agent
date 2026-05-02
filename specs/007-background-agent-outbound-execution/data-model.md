# Data Model: Background Agent Outbound Execution

## Reminder

Existing scheduled entity extended to distinguish passive reminders from autonomous proactive tasks.

Fields:

| Field             | Type                    | Notes                                                              |
| ----------------- | ----------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------- | --------------------------- |
| `id`              | `string`                | ULID primary key                                                   |
| `userIdentity`    | `string`                | Stable memory/user identity                                        |
| `channelId`       | `string`                | Channel registry key, e.g. `telegram`                              |
| `channelUserId`   | `string`                | User ID on channel                                                 |
| `conversationId`  | `string`                | Destination conversation/chat                                      |
| `description`     | `string`                | Short label for human reminder display                             |
| `scheduleType`    | `recurring              | daily                                                              | once`                                                | Existing cadence selector |
| `intervalMs`      | `number                 | null`                                                              | Existing recurring cadence                           |
| `timeOfDay`       | `string                 | null`                                                              | Existing daily cadence                               |
| `nextFireAt`      | `Date`                  | Next due instant                                                   |
| `lastFiredAt`     | `Date                   | null`                                                              | Last completed send/advance                          |
| `deliveredCount`  | `number`                | Number of completed deliveries/advances                            |
| `status`          | `active                 | delivering                                                         | dismissed                                            | completed`                | Existing reminder lifecycle |
| `mode`            | `notify                 | autonomous`                                                        | New feature flag for passive vs autonomous execution |
| `executionPrompt` | `string`                | Required full autonomous task instruction when `mode = autonomous` |
| `toolPolicy`      | `all-interactive-tools` | Only supported tool policy in this feature                         |
| `createdAt`       | `Date`                  | Creation timestamp                                                 |

Validation rules:

1. `description` remains 1..1000 chars.
2. `executionPrompt` is required when `mode = autonomous` and must not fall back to `description`.
3. `executionPrompt` max length 4000 chars.
4. Existing cadence validation rules remain unchanged.
5. `toolPolicy` is fixed to `all-interactive-tools` for this feature.

State transitions:

1. `active -> delivering` for notify-mode reminder nudges only.
2. `active -> completed` for one-time reminder after successful delivery.
3. `active` remains the steady state for recurring reminders after advance.
4. Autonomous reminder occurrence lifecycle is tracked separately in `BackgroundExecution`.

## BackgroundExecution

One persisted record per due autonomous reminder occurrence.

Fields:

| Field               | Type       | Notes                                 |
| ------------------- | ---------- | ------------------------------------- | -------------------------------------------------------------------------------------- | ------ | --------------- | ---------- | ------------------- |
| `id`                | `string`   | ULID primary key                      |
| `reminderId`        | `string`   | Foreign key to reminder               |
| `userIdentity`      | `string`   | Copied for indexed lookup             |
| `channelId`         | `string`   | Delivery channel                      |
| `channelUserId`     | `string`   | Delivery recipient on channel         |
| `conversationId`    | `string`   | Destination conversation              |
| `scheduledFor`      | `Date`     | Due time that spawned this run        |
| `startedAt`         | `Date      | null`                                 | Generation start                                                                       |
| `finishedAt`        | `Date      | null`                                 | Generation or delivery terminal time                                                   |
| `status`            | `scheduled | running                               | completed                                                                              | failed | delivery-failed | cancelled` | Execution lifecycle |
| `dedupeKey`         | `string`   | Unique key: `reminderId:scheduledFor` |
| `toolCallsJson`     | `string    | null`                                 | Serialized tool usage summary for diagnostics                                          |
| `resultText`        | `string    | null`                                 | Final outbound-ready content, retained for delivery retry when needed                  |
| `failureReason`     | `string    | null`                                 | Structured summary of generation, timeout, cancellation, recovery, or delivery failure |
| `deliveryMessageId` | `string    | null`                                 | Optional channel-specific delivery identifier if available later                       |
| `createdAt`         | `Date`     | Row creation time                     |

Validation rules:

1. `dedupeKey` must be unique.
2. `resultText` must be non-null when `status = completed`.
3. `failureReason` must be non-null when `status = failed` or `delivery-failed`.
4. `toolCallsJson` should be populated whenever tool call metadata is available from the run.

State transitions:

1. `scheduled -> running`
2. `running -> completed`
3. `running -> failed`
4. `running -> delivery-failed`
5. `scheduled | running -> cancelled`
6. startup recovery transitions stale `running` executions to `failed` with a recovery-specific failure reason.

## ExecutionContext

Ephemeral runtime context passed into the background agent invocation.

Fields:

| Field             | Type                    | Notes                                                          |
| ----------------- | ----------------------- | -------------------------------------------------------------- |
| `executionId`     | `string`                | Correlates logs and store updates                              |
| `userIdentity`    | `string`                | User being acted for                                           |
| `channelId`       | `string`                | Current channel                                                |
| `channelUserId`   | `string`                | Channel user ID                                                |
| `conversationId`  | `string`                | Same conversation used for outbound delivery and memory lookup |
| `description`     | `string`                | Short task title                                               |
| `executionPrompt` | `string`                | Required full autonomous instruction                           |
| `scheduledFor`    | `Date`                  | Due instant                                                    |
| `toolPolicy`      | `all-interactive-tools` | Selected tool access mode                                      |

Rules:

1. Must always carry the same `conversationId` used for outbound send.
2. Relevant conversation context is implicit through existing memory keyed by `userIdentity` and `conversationId`.
3. Must never require live user input; prompt construction forbids follow-up questions.

## OutboundMessageRecord

Logical result of a completed background execution.

Fields:

| Field            | Type     | Notes                          |
| ---------------- | -------- | ------------------------------ | --------------------- |
| `executionId`    | `string` | Parent execution               |
| `text`           | `string` | User-visible message           |
| `channelId`      | `string` | Delivery channel               |
| `conversationId` | `string` | Destination conversation       |
| `chunkCount`     | `number` | Channel-specific send segments |
| `deliveredAt`    | `Date    | null`                          | Terminal success time |

Rules:

1. `text` must be outbound-ready, begin with a recognizable autonomous-result marker such as `Proactive update:`, and not contain internal reasoning or debug traces.
2. `chunkCount` may exceed 1 for Telegram due to 4096-character limits.
