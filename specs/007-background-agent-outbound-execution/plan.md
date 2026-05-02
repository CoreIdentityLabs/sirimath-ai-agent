# Implementation Plan: Background Agent Outbound Execution

**Branch**: `[007-background-agent-outbound-execution]` | **Date**: 2026-05-02 | **Spec**: [spec.md](../007-background-agent-outbound-execution/spec.md)
**Input**: Feature specification from `/specs/007-background-agent-outbound-execution/spec.md`

## Summary

Add a heartbeat-driven autonomous execution path that reuses Sirimath's existing agent tool surface and channel delivery adapters to produce outbound user messages without an inbound prompt. The implementation keeps scheduling in the reminder subsystem, introduces an explicit background execution lifecycle store, builds a dedicated background-capable base agent variant on top of the current `createBaseAgent` patterns, and routes successful results back through channel adapters with idempotent delivery tracking.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 22+  
**Primary Dependencies**: `@voltagent/core`, `@voltagent/libsql`, `@voltagent/server-hono`, `@voltagent/logger`, `grammy`, `node-cron`, `zod`, `ulid`, Vercel AI SDK provider packages  
**Storage**: LibSQL/SQLite for reminders and observability; LibSQL memory DB for VoltAgent memory; optional Neo4j memory subsystem already supported  
**Testing**: `npm run typecheck`, `npm run lint`; no dedicated automated test suite is currently configured  
**Target Platform**: Node.js server process running Telegram bot plus heartbeat scheduler on Windows/Linux containers  
**Project Type**: Single TypeScript agent service  
**Performance Goals**: 90% of successful outbound runs delivered within 60 seconds of due heartbeat; bounded per-run execution so heartbeat loop remains responsive  
**Constraints**: Preserve existing reminder-only flow, no hardcoded provider logic, channel logic stays under `src/channels/`, use strict Zod-validated schemas for new persisted state and tool/workflow I/O  
**Scale/Scope**: Single-process assistant with parallel due executions per user; current heartbeat query caps due reminder fetches at 100 per tick and this feature should stay within that operational profile

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Verify each gate applies to this feature and document the outcome:

| Gate                                                                   | Principle                      | Outcome                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Agent-First: feature exposed via a VoltAgent agent                     | I. Agent-First Design          | ✅ Background execution is implemented by an agent instance, not raw scheduler business logic.                       |
| All new code in TypeScript strict; Zod schemas for tool/workflow I/O   | II. Type Safety                | ✅ New execution records, run context, and agent inputs will be schema-backed.                                       |
| New capabilities as `createTool` with typed input/output               | III. Tool-Driven Extensibility | ✅ Existing tools stay as the capability surface; any new reminder mode/config tools remain typed.                   |
| Observability adapter configured; structured logging only              | IV. Observability-First        | ✅ Existing `VoltAgentObservability` and Pino logger remain in place; background runs add structured lifecycle logs. |
| No speculative abstractions; complexity justified                      | V. Simplicity & YAGNI          | ✅ One focused background execution service plus store is sufficient; no generic job framework is introduced.        |
| Model via env vars; no hardcoded provider; Azure AI Foundry supported  | VI. Multi-Provider / BYOK      | ✅ Reuses existing `resolveModel()` flow unchanged.                                                                  |
| Channel code in `src/channels/`; agent logic channel-agnostic          | VII. Channel Abstraction       | ✅ Delivery continues through `ChannelAdapter`; background agent remains channel-agnostic.                           |
| Tech stack additions within allowed set (see Technology Stack section) | Technology Stack               | ✅ No forbidden framework additions required.                                                                        |

Post-design re-check: still ✅. The design adds only feature-specific execution orchestration around the existing agent and channel abstractions.

## Project Structure

### Documentation (this feature)

```text
specs/007-background-agent-outbound-execution/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── background-agent.md
│   └── outbound-delivery.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── base-agent.ts
│   └── background-agent.ts
├── channels/
│   ├── telegram.ts
│   └── telegram-channel-adapter.ts
├── reminders/
│   ├── heartbeat.ts
│   ├── schema.ts
│   ├── store.ts
│   ├── background-execution-store.ts
│   ├── background-runner.ts
│   ├── heartbeat-config-store.ts
│   └── ports/
│       └── channel-adapter.ts
├── tools/
│   ├── index.ts
│   └── schedule-reminder.ts
└── index.ts
```

**Structure Decision**: Keep the current single-service layout. Put new autonomous execution orchestration under `src/reminders/` because heartbeat scheduling remains the trigger source, add a dedicated background agent factory under `src/agents/`, and avoid mixing scheduling state into channel modules beyond the existing adapter boundary.

## Phase 0: Research Summary

Primary decisions are captured in [research.md](../007-background-agent-outbound-execution/research.md). The key resolved unknowns are:

1. Reuse the existing agent tool list by factoring shared tool assembly out of `createBaseAgent` and instantiating a background-specific agent with stricter instructions instead of bypassing the agent and calling tools directly.
2. Add a dedicated background execution table rather than overloading reminder status columns, because reminder lifecycle and autonomous run lifecycle are related but not equivalent.
3. Preserve channel abstraction by treating outbound proactive messages as a specialized use of `ChannelAdapter.send`, with delivery idempotency enforced by execution records instead of Telegram-specific logic.

## Phase 1: Design

### Data Model

See [data-model.md](../007-background-agent-outbound-execution/data-model.md).

### Contracts

See [background-agent.md](../007-background-agent-outbound-execution/contracts/background-agent.md) and [outbound-delivery.md](../007-background-agent-outbound-execution/contracts/outbound-delivery.md).

### Quickstart

See [quickstart.md](../007-background-agent-outbound-execution/quickstart.md).

## Implementation Approach

### 1. Factor shared tool assembly from the current base agent

Today, `createBaseAgent` in `src/agents/base-agent.ts` owns both instructions and the concrete tool list. The background path needs the same tool access with different instructions and stricter prompting. The clean split is:

```ts
type SharedAgentDeps = {
  memoryTools: Array<any>;
  reminderStore: ReminderStore;
  heartbeatCfgStore: HeartbeatConfigStore;
};

export function buildSirimathTools(deps: SharedAgentDeps) {
  return [
    weatherTool,
    fetchUrlTool,
    ...(webSearchEnabled ? [webSearchTool] : []),
    findSkillsTool,
    installSkillTool,
    ...deps.memoryTools,
    createScheduleReminderTool(deps.reminderStore),
    createSnoozeReminderTool(deps.reminderStore),
    createDismissReminderTool(deps.reminderStore),
    createListRemindersTool(deps.reminderStore),
    createConfigureHeartbeatTool(deps.heartbeatCfgStore),
  ];
}
```

Then keep `createBaseAgent()` for interactive use and add `createBackgroundAgent()` that reuses the same tools with instructions optimized for autonomous execution:

```ts
export function createBackgroundAgent({
  model,
  memory,
  ...deps
}: BaseAgentOptions) {
  return new Agent({
    name: "sirimath-background-agent",
    model,
    memory,
    tools: buildSirimathTools(deps),
    instructions: `You are Sirimath running in background mode.
Complete the proactive task using available tools when needed.
Do not ask follow-up questions because the user is not present.
If required data cannot be obtained safely, return a structured failure summary.
Produce a concise outbound-ready message with fresh results, not internal reasoning.`,
  });
}
```

Reasoning: this preserves the current tool-driven architecture and avoids a second, drifting tool registry.

### 2. Extend reminder scheduling to distinguish reminder-only and autonomous tasks

The current reminder schema only models cadence plus display description. Background execution needs task mode and possibly an execution prompt distinct from the short reminder label. Add fields directly to the reminder entity rather than creating a disconnected second task table.

Recommended additions to `src/reminders/schema.ts` and reminder storage:

```ts
export const ReminderModeSchema = z.enum(["notify", "autonomous"]);

export const ReminderSchema = z.object({
  // existing fields...
  mode: ReminderModeSchema.default("notify"),
  executionPrompt: z.string().max(4000).nullable(),
  toolPolicy: z
    .literal("all-interactive-tools")
    .default("all-interactive-tools"),
});
```

Scheduling tool extension:

```ts
export const ScheduleReminderInputSchema = z.object({
  // existing fields...
  mode: ReminderModeSchema.optional(),
  executionPrompt: z.string().max(4000).optional(),
});
```

Behavioral rule:

1. `mode = notify` preserves current `Reminder: ...` delivery.
2. `mode = autonomous` requires `executionPrompt` and causes heartbeat to create a background execution record and invoke the background agent.
3. Restricted per-task tool policies are intentionally out of scope for this feature; all autonomous runs use the existing interactive tool set.

### 3. Add a first-class background execution lifecycle store

Overloading `reminders.status` is not enough because FR-008 and FR-009 require separate tracking of scheduled, running, completed, failed, and delivery-failed executions for each due occurrence. Introduce `src/reminders/background-execution-store.ts` backed by LibSQL.

Recommended schema:

```ts
export const BackgroundExecutionStatusSchema = z.enum([
  "scheduled",
  "running",
  "completed",
  "failed",
  "delivery-failed",
  "cancelled",
]);

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
  dedupeKey: z.string(),
  toolCallsJson: z.string().nullable(),
  resultText: z.string().nullable(),
  failureReason: z.string().nullable(),
  deliveryMessageId: z.string().nullable(),
  createdAt: z.coerce.date(),
});
```

Critical persistence rules:

1. Unique index on `dedupeKey` so retries cannot create duplicate scheduled executions for the same due occurrence.
2. Transition helper methods like `markRunning`, `markCompleted`, `markFailed`, `markDeliveryFailed` so lifecycle state changes stay explicit.
3. Startup recovery marks stale `running` executions as `failed` with a recovery reason rather than re-running them automatically.
4. Delivery retry attempts reuse the same execution row and dedupe key so user-visible output remains idempotent.

Suggested dedupe key: `reminderId + ':' + dueTimestamp.toISOString()`.

### 4. Introduce a background runner service between heartbeat and channel delivery

Keep `startHeartbeat()` as the scheduler, but stop making it build user-visible text for every due item. Instead:

1. Heartbeat fetches due reminders.
2. For `notify` reminders, preserve current delivery path.
3. For `autonomous` reminders, schedule background executions and hand them to `BackgroundRunner`.

Recommended service shape:

```ts
export interface BackgroundRunnerDeps {
  agent: MemoryAwareAgentLike;
  executionStore: BackgroundExecutionStore;
  reminderStore: ReminderStore;
  registry: ChannelRegistry;
  log: Logger;
  timeoutMs: number;
}

export class BackgroundRunner {
  async runDueReminder(reminder: Reminder, scheduledFor: Date): Promise<void> {
    const execution = await this.executionStore.createScheduled(
      reminder,
      scheduledFor,
    );
    if (!execution) return;

    await this.executionStore.markRunning(execution.id);
    const result = await this.generateOutbound(reminder, execution.id);
    await this.deliver(reminder, execution.id, result.text);
  }
}
```

The generation call should pass the same identity and conversation IDs already used by Telegram inbound processing so memory and tool behavior stay aligned. Relevant conversation context is implicit through the existing memory wrapper keyed by user and conversation identifiers; this feature does not assemble additional transcript context.

```ts
const result = await agent.generateText({
  input: buildBackgroundPrompt(reminder),
  channel: reminder.channelId,
  channelUserId: reminder.channelUserId,
  conversationId: reminder.conversationId,
});
```

`buildBackgroundPrompt(reminder)` should include:

1. The autonomous task instruction from `executionPrompt`.
2. A statement that the user is absent, so no clarifying question is allowed.
3. A requirement to use tools when current data is needed.
4. A requirement to return a ready-to-send message only.
5. A formatting rule that clearly distinguishes autonomous results from reminder nudges, for example starting with `Proactive update:`.
6. A requirement to avoid internal reasoning and produce concise user-facing prose only.

Eligibility checks before generation and delivery must verify that the reminder is still active, the target channel adapter exists, the conversation ID is present, and any channel/user access preconditions still hold. If not, the execution is marked `cancelled` or `failed` with a structured reason and no message is sent.

Eligibility outcome policy:

1. Mark `cancelled` when the reminder is inactive, disabled, or intentionally skipped before generation.
2. Mark `failed` when execution cannot proceed because required runtime prerequisites are broken, such as missing adapter, invalid conversation ID, timeout, or delivery failure.

### 5. Bound execution time and isolate overlap

The current heartbeat loop is serialized via a `ticking` flag, but multiple due reminders per tick are processed in-process. FR-016 requires overlapping background runs to be allowed and isolated. The concrete policy for this feature is:

1. Keep one scheduler tick active at a time.
2. Launch autonomous runs as detached promises inside the tick with per-execution lifecycle records.
3. No per-user serialization is introduced.
4. Each due reminder occurrence maps to one execution row keyed by `dedupeKey = reminderId:scheduledFor`.
5. Reminder advancement occurs only after terminal outcome handling for that occurrence, so overlapping executions remain attributable to the correct due time.
6. On restart, stale `running` executions are failed rather than resumed.
7. No extra concurrency guard is added for non-idempotent tool side effects in this feature; only execution-state isolation and outbound dedupe are guaranteed.

Implementation detail:

```ts
const launches = reminders.map((reminder) => {
  if (reminder.mode !== "autonomous") {
    return deliverReminderNudge(reminder);
  }

  return runner.runDueReminder(reminder, reminder.nextFireAt).catch((err) => {
    log.error("[heartbeat] background run failed", {
      reminderId: reminder.id,
      err,
    });
  });
});

await Promise.allSettled(launches);
```

If runtime pressure becomes visible later, add a narrow limiter around autonomous runs, but do not introduce a distributed queue in this feature.

### 6. Preserve channel abstraction while supporting outbound result formatting and limits

Telegram already splits long inbound replies in `src/channels/telegram.ts`, but `TelegramChannelAdapter.send()` currently forwards raw text without splitting. This is an existing gap against FR-015 for outbound messages. The feature standardizes on split-only behavior for oversized output. Move the shared split logic into channel-facing code and reuse it for both inbound and outbound paths.

Recommended refactor:

```ts
export function splitTelegramMessage(text: string, maxLen = 4096): string[] {
  // move existing logic from telegram.ts here
}

export class TelegramChannelAdapter implements ChannelAdapter {
  async send({ conversationId, text }: ChannelSendOptions): Promise<void> {
    const chunks = splitTelegramMessage(text);
    for (const chunk of chunks) {
      await this.bot.api.sendMessage(conversationId, chunk);
    }
  }
}
```

This keeps the channel-specific size policy inside the Telegram adapter instead of polluting the background runner.

### 7. Wire startup in `src/index.ts`

`src/index.ts` currently creates only the interactive base agent and starts heartbeat with stores plus channel registry. The new composition should be:

```ts
const interactiveAgent = createBaseAgent({...});
const backgroundAgent = createBackgroundAgent({...});

const agent = memorySubsystem.wrap(interactiveAgent);
const backgroundMemoryAwareAgent = memorySubsystem.wrap(backgroundAgent);

const executionStore = new BackgroundExecutionStore(remindersDb);
await executionStore.migrate();

const backgroundRunner = new BackgroundRunner({
  agent: backgroundMemoryAwareAgent,
  executionStore,
  reminderStore,
  registry: channelRegistry,
  log: logger,
  timeoutMs: Number(process.env.BACKGROUND_RUN_TIMEOUT_MS ?? 45000),
});

const stopHeartbeat = startHeartbeat(
  reminderStore,
  heartbeatCfgStore,
  channelRegistry,
  logger,
  { ...heartbeatOpts, backgroundRunner },
);
```

The background agent should not need registration in the public VoltAgent server unless future workflows expose it. Keep it internal unless a later feature requires observability through explicit agent registration.

### 8. Observability and failure handling

Required logging and state transitions:

1. Log execution creation with reminder ID, user identity, scheduled time, dedupe key.
2. Record completion with elapsed time and delivery status.
3. Record failure reason for generation errors separately from delivery errors.
4. On delivery failure, keep the reminder occurrence advanced only if the execution record preserves non-delivery and dedupe prevents replay spam.

Recommended delivery rule:

1. Generate result.
2. Attempt delivery.
3. If delivery succeeds, mark execution `completed` and advance reminder.
4. If generation fails, mark execution `failed` and do not send placeholder text.
5. If delivery fails, mark execution `delivery-failed`, persist the generated text and failure reason, and allow retry against the same execution record and dedupe key.
6. Persist tool usage metadata into `toolCallsJson` for every completed or failed run where tool invocation data is available.

Instrumentation expectations:

1. Persist timestamps for scheduled, started, finished, and delivery outcome transitions.
2. Use `scheduledFor` and the first terminal-state timestamp as the authoritative basis for SC-001.
3. Use `scheduledFor` and successful delivery timestamp for `completed` executions as the authoritative basis for SC-002.
4. Persist enough diagnostic state to verify SC-001 through SC-005 manually or through future observability queries.
5. Record timeout expiry as a specific failure reason so timeout behavior is distinguishable from tool or delivery errors.

## Implementation Snippets By File

### `src/agents/base-agent.ts`

Refactor to expose a shared tool builder and keep existing interactive instructions intact.

### `src/agents/background-agent.ts`

New file creating the autonomous agent with no user-interaction assumptions.

### `src/reminders/schema.ts`

Add `ReminderModeSchema`, `BackgroundExecutionStatusSchema`, `BackgroundExecutionSchema`, and any new schedule input fields.

### `src/reminders/store.ts`

Migrate reminder table to include `mode`, `executionPrompt`, and `toolPolicy`; update row mapping and insertion logic.

### `src/reminders/background-execution-store.ts`

New file with migration, dedupe-safe create, lifecycle updates, stale recovery, and query helpers.

### `src/reminders/background-runner.ts`

New orchestration service for eligibility checks, autonomous execution, timeout handling, tool usage capture, stale-run-safe delivery retry behavior, autonomous message formatting, and outbound delivery.

### `src/reminders/heartbeat.ts`

Branch current flow between `notify` and `autonomous`, keeping digest behavior for notify-only reminders unless requirements later expand digest semantics for autonomous tasks.

### `src/channels/telegram-channel-adapter.ts`

Handle multi-chunk outbound send internally to satisfy channel-size constraints.

### `README.md`

Update the product documentation to describe the new autonomous heartbeat path, how it differs from reminder-only behavior, and any new configuration or usage expectations.

Recommended README additions:

1. A short feature note in the overview explaining that heartbeat tasks can now either send passive reminders or execute autonomous background agent tasks.
2. Environment/configuration notes for any new timeout or execution-related settings such as `BACKGROUND_RUN_TIMEOUT_MS`.
3. A usage example showing the difference between a reminder-only schedule and an autonomous proactive task.
4. A brief operational note that outbound proactive execution reuses the same tool surface and channel delivery path as the interactive agent.

Suggested documentation snippet:

```md
## Proactive Background Execution

Sirimath can now run certain heartbeat-triggered tasks autonomously. In addition to standard reminder nudges, a scheduled task can wake a background agent, use the same allowed tools as interactive chat, and push a fresh outbound result into the user's chat without waiting for a new message.

- Reminder mode: sends a scheduled reminder message only.
- Autonomous mode: executes the scheduled task, fetches current data if needed, and delivers the result proactively.

Use `BACKGROUND_RUN_TIMEOUT_MS` to cap how long a single background execution may run before it is marked as failed.
```

## Testing and Validation Plan

Because the repository has no test suite configured, validation for this feature should be task-driven and use the existing correctness gates plus focused manual scenarios:

1. `npm run typecheck`
2. `npm run lint`
3. Manual scenario: autonomous reminder using `fetchUrl` produces a fresh outbound Telegram message at heartbeat time.
4. Manual scenario: tool failure produces no misleading outbound message and an execution record with `failed` status.
5. Manual scenario: Telegram outbound result exceeding 4096 characters is split into ordered chunks.
6. Manual scenario: process restart after `running` execution does not duplicate delivered messages for the same dedupe key.
7. Manual scenario: timeout expiry marks the execution failed with a timeout-specific reason and does not monopolize subsequent heartbeat work.
8. Manual scenario: ineligible execution conditions such as missing adapter, inactive reminder, or invalid conversation ID cancel or fail the run without delivery.
9. Manual scenario: delivery retry uses the same execution record and does not create duplicate visible sends.
10. Manual scenario: autonomous messages are visibly distinct from ordinary reminder nudges, for example by a `Proactive update:` prefix.
11. Manual scenario: persisted diagnostics include tool usage metadata, failure reason, and enough timestamps to inspect latency and status.

## Risks and Mitigations

| Risk                                                      | Impact                                     | Mitigation                                                                                      |
| --------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Background agent asks clarifying questions                | Run stalls or produces unusable output     | Background-specific instructions prohibit questions and require final outbound-ready text only. |
| Duplicate sends on retry/restart                          | User trust damage and spam                 | Dedicated execution store with unique dedupe key and explicit delivery state.                   |
| Channel limit violations                                  | Delivery failure for long results          | Move Telegram chunking into adapter-level outbound send.                                        |
| Memory wrapper behavior differs without inbound user turn | Wrong user context or no memory continuity | Reuse same `channelUserId` and `conversationId` invocation shape as Telegram inbound handling.  |
| Reminder schema migration breaks existing rows            | Existing reminders stop firing             | Use additive columns with defaults and migration-safe row mapping.                              |

## Complexity Tracking

No constitution violations currently require justification.
