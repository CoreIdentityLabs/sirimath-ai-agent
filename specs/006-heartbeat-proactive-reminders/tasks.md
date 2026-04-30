---
description: "Task list for 006-heartbeat-proactive-reminders"
---

# Tasks: Heartbeat & Proactive Task Reminders

**Input**: Design documents from `/specs/006-heartbeat-proactive-reminders/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Not requested — no test tasks generated.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. Foundational phase must complete before any user story begins.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: User story label (US1–US5), only in user story phases

---

## Phase 1: Setup

**Purpose**: Confirm package dependency and prepare workspace.

- [ ] T001 Confirm `node-cron ^3.0.3` in `dependencies` and `@types/node-cron ^3.0.3` in `devDependencies` in `package.json` (already installed via `npm install --legacy-peer-deps`)

**Checkpoint**: `node-cron` importable, types available.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core schemas, utilities, storage classes, and interfaces that ALL user stories depend on. No user story work can begin until this phase is complete.

> T002, T003, T004 can all start simultaneously — they are independent files with no inter-dependencies.
> T005 and T006 can start simultaneously once T002 is complete — they are NOT parallel with T002.

- [ ] T002 [P] Create Zod schemas for `Reminder`, `HeartbeatConfig`, and all tool I/O in `src/reminders/schema.ts`
- [ ] T003 [P] Create pure schedule utilities `nextFireAtFromSchedule()` and `advanceFireAt()` in `src/reminders/next-fire-at.ts`
- [ ] T004 [P] Create `ChannelSendOptions` interface, `ChannelAdapter` interface, and `ChannelRegistry` class in `src/reminders/ports/channel-adapter.ts`
- [ ] T005 [P with T006; requires T002] Create `ReminderStore` class with `migrate()`, `insert()`, `dueReminders()`, `advance()`, `updateStatus()`, `snooze()`, `listForUser()` backed by `reminders.db` in `src/reminders/store.ts`
- [ ] T006 [P with T005; requires T002] Create `HeartbeatConfigStore` class with `migrate()`, `get()`, `upsert()`, `delete()` backed by `reminders.db` in `src/reminders/heartbeat-config-store.ts`

**Checkpoint**: All schemas, stores, and interfaces compile cleanly. Foundation ready — user story phases can now begin.

---

## Phase 3: User Story 1 — Interactive Reminder Scheduling at Task Creation (Priority: P1) 🎯 MVP

**Goal**: When a user states a task or follow-up, Sirimath asks for a reminder cadence, persists the schedule with a structured `scheduleReminder` tool call, and confirms the next fire time.

**Independent Test**: Create a new follow-up item in chat, verify Sirimath asks for a cadence, reply "every 6 hours", verify a row is inserted in `reminders.db` with `scheduleType='recurring'`, `intervalMs=21600000`, and `nextFireAt` ~6h from now — before any heartbeat fires.

**Acceptance Scenarios covered**: FR-003, FR-004, SC-001

- [ ] T007 [P] [US1] Create `createScheduleReminderTool(store)` factory using `ScheduleReminderInputSchema`, `nextFireAtFromSchedule`, and `ulid` in `src/tools/schedule-reminder.ts`
- [ ] T008 [US1] Add `export { createScheduleReminderTool } from "./schedule-reminder.js"` to `src/tools/index.ts`
- [ ] T009 [US1] Wire dedicated `remindersDb` LibSQL client (`file:./.voltagent/reminders.db`), `ReminderStore`, `HeartbeatConfigStore` instantiation and migrations, and `createScheduleReminderTool(reminderStore)` in agent tools array in `src/index.ts`
- [ ] T010 [US1] Append agent instructions for interactive cadence prompt — ask for reminder schedule when any actionable item is created, call `scheduleReminder` on reply, confirm next fire time — in `src/index.ts`

**Checkpoint**: US1 fully functional. User can create a reminder with a cadence and get confirmation. No heartbeat required.

---

## Phase 4: User Story 2 — Proactive Follow-Up Nudge (Priority: P1)

**Goal**: The heartbeat scanner (node-cron, default `* * * * *`) finds due reminders, dispatches them through the channel-agnostic `ChannelAdapter`, retries on failure, and advances `nextFireAt` (or completes one-shot reminders).

**Independent Test**: Insert a reminder with `nextFireAt = now - 1s` directly into `reminders.db`. Wait one minute (or use `HEARTBEAT_CRON=*/10 * * * * *` for 10s). Verify a Telegram message arrives, `deliveredCount` is incremented, `nextFireAt` is advanced (recurring) or `status='completed'` (once).

**Acceptance Scenarios covered**: FR-001, FR-002, FR-005, FR-006, FR-007, FR-013, FR-014, SC-002, SC-003, SC-009

> T011 and T012 can start simultaneously — different files, both depend only on Phase 2.

- [ ] T011 [P] [US2] Create `TelegramChannelAdapter` implementing `ChannelAdapter` using `bot.api.sendMessage` in `src/channels/telegram-channel-adapter.ts`
- [ ] T012 [P] [US2] Create `startHeartbeat(store, cfgStore, registry, log, opts)` using `cron.schedule()`, `cron.validate()`, immediate startup tick (FR-014), per-reminder quiet-hours check, 3-attempt retry with linear back-off, `advance()` / `updateStatus('completed')` after delivery (these two must always run atomically: mark as `delivering` before the send attempt and advance/complete only after a confirmed send), `task.stop()` return value in `src/reminders/heartbeat.ts`
- [ ] T013 [US2] Add `channelRegistry: ChannelRegistry` as third parameter to `startTelegramBot` and call `channelRegistry.register(new TelegramChannelAdapter(bot))` inside in `src/channels/telegram.ts`
- [ ] T014 [US2] Instantiate `ChannelRegistry`, pass it to `startTelegramBot`, call `startHeartbeat` with `HEARTBEAT_CRON` env var, register `SIGTERM`/`SIGINT` shutdown handlers calling `stopHeartbeat()` and `memorySubsystem.stop()` in `src/index.ts`

**Checkpoint**: US2 fully functional. Proactive messages arrive on Telegram at scheduled times. Restarts deliver overdue reminders within seconds.

---

## Phase 5: User Story 3 — Scheduled Daily Digest (Priority: P2)

**Goal**: When `digestEnabled=true` and `digestTime` is set in `heartbeat_config`, the heartbeat sends a single consolidated message listing all active reminders at the configured time — never more than one digest per digest window.

**Independent Test**: Insert multiple active reminders in `reminders.db`. Set `digestEnabled=1`, `digestTime='09:00'` in `heartbeat_config`. Wait for 09:00 (or manipulate `digestTime` to current HH:mm in test). Verify one message arrives listing all items, no individual nudges sent.

**Acceptance Scenarios covered**: FR-009, SC-008

> T016 can start in parallel with T015 — it is a new independent file.

- [ ] T015 [US3] Extend `startHeartbeat()` to detect per-user `digestEnabled` + `digestTime` from `HeartbeatConfigStore`, aggregate all active reminders for that user via `listForUser`, send a single digest message through the channel adapter, and skip individual nudges for reminders already covered by the digest window in `src/reminders/heartbeat.ts`
- [ ] T016 [P] [US3] Create `createListRemindersTool(store)` factory using `ListRemindersInputSchema` and `ReminderStore.listForUser()` in `src/tools/list-reminders.ts`
- [ ] T017 [US3] Add `export { createListRemindersTool } from "./list-reminders.js"` to `src/tools/index.ts`
- [ ] T018 [US3] Add `createListRemindersTool(reminderStore)` to agent tools array and append agent instructions for `listReminders` usage in `src/index.ts`

**Checkpoint**: US3 fully functional. Daily digest fires at configured time with all open items.

---

## Phase 6: User Story 4 — Reminder Management via Chat (Priority: P2)

**Goal**: Users can reply "snooze 2 hours" or "done" in response to a reminder; Sirimath calls `listReminders` to find the target ID, then `snoozeReminder` or `dismissReminder` to update the record.

**Independent Test**: Trigger a reminder (or note the ID from `listReminders`). Reply "snooze 1 hour" — verify `nextFireAt` advances by 3600000ms and confirmation is received. Reply "done" — verify `status='completed'` and no further reminders fire.

**Acceptance Scenarios covered**: FR-010, FR-011, SC-004, US4-AC1, US4-AC2

> T019 and T020 can start simultaneously — different files.

- [ ] T019 [P] [US4] Create `createSnoozeReminderTool(store)` factory using `SnoozeReminderInputSchema` and `ReminderStore.snooze()` in `src/tools/snooze-reminder.ts`
- [ ] T020 [P] [US4] Create `createDismissReminderTool(store)` factory using `DismissReminderInputSchema` and `ReminderStore.updateStatus()` in `src/tools/dismiss-reminder.ts`
- [ ] T021 [US4] Add `export { createSnoozeReminderTool } from "./snooze-reminder.js"` and `export { createDismissReminderTool } from "./dismiss-reminder.js"` to `src/tools/index.ts`
- [ ] T022 [US4] Add `createSnoozeReminderTool(reminderStore)` and `createDismissReminderTool(reminderStore)` to agent tools array in `src/index.ts`
- [ ] T023 [US4] Extend agent instructions with snooze/dismiss/acknowledge reply handling — call `listReminders` to find ID, then route to `snoozeReminder` or `dismissReminder` based on user intent — in `src/index.ts`

**Checkpoint**: US4 fully functional. Snooze, dismiss, and list all work in-channel with natural language.

---

## Phase 7: User Story 5 — Heartbeat Schedule Configuration (Priority: P3)

**Goal**: Users configure quiet hours and weekday restrictions via natural-language chat. Sirimath persists preferences in `heartbeat_config` table via a `configureHeartbeat` tool; the running heartbeat respects them immediately (within one tick).

**Independent Test**: Tell Sirimath "only remind me between 8 AM and 10 PM on weekdays". Verify `heartbeat_config` row is updated with correct `quietHoursStart`, `quietHoursEnd`, `quietDays`. Schedule a reminder for 11 PM — verify it is held during quiet hours and fires after 8 AM next day.

**Acceptance Scenarios covered**: FR-008, FR-012, SC-005, SC-007, US5-AC1, US5-AC2, US5-AC3

- [ ] T024 [US5] Create `createConfigureHeartbeatTool(cfgStore)` factory with Zod input schema covering `userIdentity`, `quietHoursStart`, `quietHoursEnd`, `quietDays`, `digestEnabled`, `digestTime`, `digestChannelId`; calls `HeartbeatConfigStore.upsert()`. Also expose a `reset` flag — when `reset: true`, call `HeartbeatConfigStore.delete(userIdentity)` to restore system defaults — in `src/tools/configure-heartbeat.ts`
- [ ] T025 [US5] Add `export { createConfigureHeartbeatTool } from "./configure-heartbeat.js"` to `src/tools/index.ts`
- [ ] T026 [US5] Add `createConfigureHeartbeatTool(heartbeatCfgStore)` to agent tools array in `src/index.ts`
- [ ] T027 [US5] Append agent instructions for quiet hours and weekday configuration — detect user preferences in chat, call `configureHeartbeat` with structured params, confirm updated settings — in `src/index.ts`

**Checkpoint**: US5 fully functional. Quiet hours are respected; preferences survive restart (stored in `reminders.db`).

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, type-safety verification, and lint compliance across all new files.

- [ ] T028 [P] Add `## Heartbeat & Proactive Reminders` section to `README.md` including: how it works, supported reminder types table, storage note (`reminders.db`), `HEARTBEAT_CRON` configuration table with expression examples
- [ ] T029 Run `npm run typecheck` across all new and modified files; fix any TypeScript errors
- [ ] T030 Run `npm run lint:fix` (Biome); fix any remaining lint issues in `src/reminders/`, `src/channels/telegram-channel-adapter.ts`, `src/tools/schedule-reminder.ts`, `src/tools/snooze-reminder.ts`, `src/tools/dismiss-reminder.ts`, `src/tools/list-reminders.ts`, `src/tools/configure-heartbeat.ts`

**Checkpoint**: `npm run typecheck` and `npm run lint` both exit 0. Feature branch ready for review.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)         → No dependencies. Start immediately.
Phase 2 (Foundational)  → Depends on Phase 1. BLOCKS all user story phases.
Phase 3 (US1)           → Depends on Phase 2 (T002, T003, T005, T006).
Phase 4 (US2)           → Depends on Phase 2 (T002, T003, T004, T005, T006).
Phase 5 (US3)           → Depends on Phase 4 (T012 heartbeat.ts must exist).
Phase 6 (US4)           → Depends on Phase 2 (T002, T005). Independent of US1–US3.
Phase 7 (US5)           → Depends on Phase 2 (T002, T006). Independent of US1–US4.
Phase 8 (Polish)        → Depends on all desired phases being complete.
```

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only. No story dependencies.
- **US2 (P1)**: Depends on Phase 2 only. No story dependencies. (Tests via manually inserted DB rows.)
- **US3 (P2)**: Depends on US2 (heartbeat.ts must exist before extending with digest). T016 in this phase provides `listForUser` aggregation used by the digest — US4 is NOT a prerequisite.
- **US4 (P2)**: Depends on Phase 2 only. Can be built in parallel with US1 and US2.
- **US5 (P3)**: Depends on Phase 2 only. Quiet-hours enforcement already in heartbeat.ts (US2); US5 adds the user-facing `configureHeartbeat` tool on top.

### Within-Phase Parallel Opportunities

| Phase   | Parallel group            | Sequential after                                       |
| ------- | ------------------------- | ------------------------------------------------------ |
| Phase 2 | T002, T003, T004 together | T005, T006 wait for T002 only; then T005+T006 parallel |
| Phase 3 | T007 alone                | T008 → T009 → T010                                     |
| Phase 4 | T011 + T012 together      | T013 waits for T011; T014 waits for T011+T012+T013     |
| Phase 5 | T016 alongside T015       | T017 → T018                                            |
| Phase 6 | T019 + T020 together      | T021 → T022 → T023                                     |
| Phase 7 | T024 alone                | T025 → T026 → T027                                     |

### Cross-Story `src/index.ts` Touch Points

`src/index.ts` is modified in T009, T010, T014, T018, T022, T023, T026, T027. Each touch point is additive (new imports, new tool factory calls, instruction string appends). Edit sequentially within each story phase.

---

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 + Phase 4** (US1 + US2 only)

This delivers the core value: user sets a reminder cadence → Sirimath proactively delivers it on schedule. All other stories (US3–US5) are incremental enhancements that build on this foundation.

**Suggested delivery order**:

1. Phase 1 + Phase 2 (foundation — ~2–3 hours)
2. Phase 3 (US1 scheduling — ~1–2 hours) → delivers SC-001
3. Phase 4 (US2 heartbeat delivery — ~2–3 hours) → delivers SC-002, SC-003, SC-006
4. Phase 6 (US4 snooze/dismiss — ~1 hour) → delivers SC-004
5. Phase 5 (US3 digest — ~1–2 hours) → delivers SC-008
6. Phase 7 (US5 quiet hours config — ~1 hour) → delivers SC-005, SC-007
7. Phase 8 (polish — ~30 min)
