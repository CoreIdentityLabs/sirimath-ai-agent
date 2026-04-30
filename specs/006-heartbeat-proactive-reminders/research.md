# Research: Heartbeat & Proactive Task Reminders

**Feature**: 006-heartbeat-proactive-reminders  
**Date**: 2026-04-30

---

## R-001: In-Process Scheduler Library Choice

**Question**: Should we add `node-cron` / `cron` package for scheduling, or use `setInterval`?

**Decision**: Use `node-cron ^3.0.3` with a default cron expression of `* * * * *` (every minute).

**Rationale**:

- `node-cron` exposes a standard cron expression interface (`"* * * * *"`, `"*/5 * * * *"`, etc.) that operators already understand and that can be tuned without code changes — just update `HEARTBEAT_CRON` in `.env`.
- Unlike a raw `setInterval`, cron expressions are timezone-aware (node-cron v3 accepts a `timezone` option), support sub-minute scheduling with the seconds field (`"*/30 * * * * *"`), and align naturally with the `daily` reminder type which is best expressed as a time-of-day schedule.
- Extensibility: future per-user digest schedules ("daily at 9 AM") can reuse `cron.schedule()` with a derived expression, keeping all scheduling logic in one abstraction layer.
- `node-cron ^3.0.3` is a small, battle-tested library (zero peer-dependency conflicts beyond Node.js) and ships TypeScript declarations via `@types/node-cron`.
- The `ScheduledTask` returned by `cron.schedule()` has a `.stop()` method that cleanly shuts down on `SIGTERM`/`SIGINT`, matching the shutdown pattern already used by `memorySubsystem.stop()`.
- Per-item reminder schedules remain stored as `intervalMs` (milliseconds) + `nextFireAt` (ISO timestamp). The heartbeat still queries `WHERE nextFireAt <= now` on each tick — no cron expressions are stored per-reminder. `node-cron` only drives the outer heartbeat tick.

**Alternatives considered**:

- `setInterval`: Simpler but less operator-friendly; no timezone support; no sub-minute scheduling without boilerplate; does not fire before the first interval elapses (requires a separate "leading tick" workaround).
- External worker / Redis queue: Massively over-engineered for a single-user personal assistant running in one Node process.

---

## R-002: Reminder Persistence Storage

**Question**: Should reminders be stored in the Neo4j graph memory store, the existing LibSQL `memory.db`, a new SQLite file, or as Neo4j nodes?

**Decision**: Dedicated LibSQL/SQLite file `reminders.db` at `.voltagent/reminders.db` — separate from `memory.db`.

**Rationale**:

- **Separation of concerns**: `memory.db` owns the AI memory subsystem (conversation history, knowledge graph cache, observability). Mixing time-ordered job queues into the same file conflates two distinct subsystems with different access patterns, backup strategies, and lifecycle concerns. A separate file makes each concern independently manageable.
- **Independent backup/restore**: Operators can back up or wipe reminder schedules without touching conversation memory, and vice-versa. This is especially important when debugging stuck reminders or resetting state.
- **Write contention**: The memory subsystem performs frequent WAL writes (every message turn). A separate file for heartbeat writes (once per minute + per-user interaction) eliminates any SQLite write-lock contention and keeps WAL checkpoint times short.
- **Maintainability**: Adding a migration to `reminders.db` cannot accidentally affect the schema of `memory.db`. The `ReminderStore` and `HeartbeatConfigStore` classes own their own `Client` instance, making the dependency graph explicit and testable in isolation.
- LibSQL/SQLite is already a transitive dependency (`@libsql/client` via `@voltagent/libsql`). Creating a second client pointing to a different file costs nothing extra.

**Alternatives considered**:

- Reuse `memory.db`: Simpler initially, but couples two independent subsystems; complicates backup, schema evolution, and write performance.
- Neo4j: Overkill; graph semantics don't apply to time-ordered queues; not available in degraded mode.
- In-memory only (Map): Doesn't survive restarts, violating FR-012 / FR-009.

---

## R-003: Channel Adapter Architecture

**Question**: How should the channel abstraction be structured so that the reminder dispatcher is channel-agnostic and Telegram is the initial implementation?

**Decision**: `ChannelAdapter` interface in `src/reminders/ports/channel-adapter.ts`; `TelegramChannelAdapter` in `src/channels/telegram-channel-adapter.ts`; a `ChannelRegistry` singleton passed through the dependency graph at startup.

**Rationale**:

- Constitution Principle VII explicitly requires channel code in `src/channels/` and agent logic to be channel-agnostic. A typed interface satisfies this gate.
- The `Bot` instance from grammy must be shared between the message handler (already in `telegram.ts`) and the proactive outbound sender. Creating the adapter inside `startTelegramBot` and registering it avoids exposing the bot instance externally.
- The `ChannelRegistry` is a simple `Map<string, ChannelAdapter>`. No framework needed.

**Telegram API surface needed**: `bot.api.sendMessage(chatId, text)` — outbound messages from the bot to a chat, which is already used implicitly via `ctx.reply`. Using `bot.api.sendMessage` directly (not via a context) is the correct pattern for proactive (non-reply) messages.

**Alternatives considered**:

- Making `telegram.ts` directly aware of reminders: Violates channel abstraction principle.
- Dependency injection container: Over-engineering for two classes.

---

## R-004: Interval Parsing ("every 6 hours", "daily at 9 AM", "in 3 days")

**Question**: How should user-specified reminder cadences be parsed into a structured schedule?

**Decision**: Two-mode schedule: **recurring** (intervalMs + nextFireAt) and **one-shot** (specific ISO timestamp). The LLM agent extracts the schedule from free text and calls `scheduleReminder` with a structured parameter; no regex parsing in tool code.

**Rationale**:

- The agent already understands natural language. Rather than writing a brittle regex parser for "every 6 hours" vs "daily at 9 AM", the `scheduleReminder` tool accepts structured Zod-typed input that the agent fills from its own natural-language understanding.
- The tool input schema expresses intent clearly: `{ type: "recurring", intervalMs: number }` or `{ type: "once", fireAt: string (ISO) }` or `{ type: "daily", timeOfDay: "HH:mm" }`.
- A small utility `nextFireAtFromSchedule(schedule, now)` computes `nextFireAt` deterministically from the structured value — no ambiguity.

**Three schedule types**:

| Type        | Example         | Storage                                        |
| ----------- | --------------- | ---------------------------------------------- |
| `recurring` | "every 6 hours" | `intervalMs = 21600000`                        |
| `daily`     | "daily at 9 AM" | `intervalMs = 86400000`, `timeOfDay = "09:00"` |
| `once`      | "in 3 days"     | `intervalMs = null`, `nextFireAt = now + 3d`   |

**Alternatives considered**:

- Runtime parsing of cron expressions: More powerful but requires `node-cron` and the LLM producing valid cron strings.
- Free-text `intervalExpression` stored as string, parsed at fire time: Error-prone; parsing failures would silently skip reminders.

---

## R-005: Snooze / Dismiss Flow via Conversational Reply

**Question**: How does the agent know that an incoming message is a response to a specific reminder rather than a new request?

**Decision**: The reminder message includes an embedded context hint. When the user replies, the agent detects reminder-management intent via tool calls to `snoozeReminder` or `dismissReminder`. No special message-routing logic is needed in the channel layer.

**Rationale**:

- Reminders are delivered with a footer: `_Reply "snooze [duration]" or "done" to manage this reminder._`
- The agent instructions include: "When a user says snooze or done in response to a reminder, call `snoozeReminder` or `dismissReminder` with the reminder ID. The most recent delivered reminder's ID for this user is available via `listReminders`."
- This is simpler than embedding reminder IDs in inline keyboard buttons (would require Telegram-specific logic) or parsing special reply syntax in the channel layer.

**Alternatives considered**:

- Telegram inline keyboard buttons: Would only work on Telegram; violates channel-agnostic requirement.
- Storing "pending user reply" state per-conversation: Stateful flow management is complex and fragile across restarts.

---

## R-006: Missed Heartbeat Recovery on Restart (FR-014)

**Decision**: On startup, the heartbeat makes one immediate scan before starting the regular interval. Any reminder with `nextFireAt <= now` is treated as overdue and fired immediately.

**Rationale**:

- `setInterval` does not fire the callback before the first interval elapses. An explicit `run()` call at startup ensures overdue reminders are caught within seconds of restart.
- This matches the existing pattern in `startConsolidationScheduler` which also uses a leading `setTimeout` (5 min warm-up) before the first run.

---

## R-007: Quiet Hours Implementation

**Decision**: Per-user `heartbeat_config` row stores `quietHoursStart` and `quietHoursEnd` as `"HH:mm"` strings (24-hour). Each heartbeat tick checks the current local time against the configured window. If inside quiet hours, no reminders are dispatched (they remain `active` with unchanged `nextFireAt` and are fired at the next tick outside quiet hours).

**Rationale**:

- Simple wall-clock comparison. No timezone library needed for the initial release; the server's local timezone (or UTC if deployed in Docker) is the effective timezone.
- "Quiet hours" do not push `nextFireAt` forward — they simply suppress dispatch. When quiet hours end, the next tick fires any overdue reminders.

**Future consideration**: Per-user timezone (IANA timezone string) stored in `UserProfile.preferences["timezone"]` can be used in a follow-up to convert UTC `nextFireAt` to local time for display. Not required for initial release.
