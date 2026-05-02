# Research: Background Agent Outbound Execution

## Decision 1: Use a dedicated background agent built from the existing base-agent tool pattern

Decision: Factor shared Sirimath tool assembly out of `src/agents/base-agent.ts` and create a second agent factory for autonomous runs.

Rationale: The current `createBaseAgent` already centralizes the supported tool surface. Reusing that list preserves feature parity with interactive execution and keeps tool permissions consistent with FR-003 and FR-004. A separate agent instance allows different instructions for autonomous work without weakening the interactive agent prompt.

Alternatives considered:

- Call tools directly from the heartbeat loop. Rejected because it bypasses the agent-first architecture and forces tool-selection logic into scheduler code.
- Reuse the exact same agent instructions. Rejected because the current prompt explicitly assumes a live user and reminder follow-up interactions.

## Decision 2: Add a dedicated background execution lifecycle table

Decision: Introduce a new persisted `background_executions` table instead of overloading reminder status fields.

Rationale: Reminder lifecycle tracks long-lived scheduled tasks, while autonomous run lifecycle tracks one due occurrence. FR-008, FR-009, FR-011, FR-016, and FR-017 require per-occurrence tracking, deduplication, and delivery attribution that do not fit cleanly into the existing `reminders.status` column.

Alternatives considered:

- Reuse `reminders.status` with extra values like `running` and `failed`. Rejected because recurring reminders can produce many executions over time and need historical attribution.
- Keep execution state only in logs. Rejected because logs alone do not support dedupe or reliable operator inspection.

## Decision 3: Keep heartbeat as the trigger and add a background runner service

Decision: Leave `src/reminders/heartbeat.ts` responsible for due-item discovery, but delegate autonomous runs to a dedicated `BackgroundRunner` service.

Rationale: The heartbeat loop already owns cadence, quiet hours, digest checks, and due reminder enumeration. A background runner isolates generation, timeout, and delivery concerns without introducing a generic job system.

Alternatives considered:

- Replace heartbeat with VoltAgent workflows or triggers for all reminders. Rejected because that is a larger architectural migration than this feature requires.
- Embed all run logic directly in `heartbeat.ts`. Rejected because it would continue mixing scheduling, orchestration, and delivery concerns in one file.

## Decision 4: Enforce idempotency through execution dedupe keys, not Telegram-specific message checks

Decision: Use a unique dedupe key derived from reminder ID plus scheduled fire time and store delivery state in `background_executions`.

Rationale: FR-009 applies across channels, not just Telegram. The idempotency boundary belongs to the execution record, while channel adapters should remain focused on delivery.

Alternatives considered:

- Query Telegram for previously sent messages. Rejected because it is channel-specific and not reliable as a system-wide contract.
- Keep an in-memory set of delivered executions. Rejected because it fails across process restarts.

## Decision 5: Move Telegram message splitting into the adapter path used for outbound sends

Decision: Refactor the existing text splitting logic from `src/channels/telegram.ts` into reusable channel-side code and apply it inside `TelegramChannelAdapter.send()`.

Rationale: Outbound proactive messages use `ChannelAdapter.send()` directly. Keeping the split behavior only in inbound request handlers would leave proactive delivery vulnerable to Telegram size limits and violate FR-015.

Alternatives considered:

- Split messages in the background runner. Rejected because channel-specific limits belong in channel adapters.
- Truncate long proactive messages. Rejected because truncation loses task output and reduces usefulness.
