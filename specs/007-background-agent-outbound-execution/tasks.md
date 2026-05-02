# Tasks: Background Agent Outbound Execution

**Input**: Design documents from `/specs/007-background-agent-outbound-execution/`
**Prerequisites**: `plan.md`, `research.md`, `data-model.md`, `contracts/`

## Task Format

- `[ID] [P?] Description`
- `[P]` means the task can proceed in parallel with other tasks once its dependencies are satisfied.
- Include explicit file targets so implementation stays bounded.

## Phase 1: Schema And Persistence

- [x] [T001] Extend reminder schemas in `src/reminders/schema.ts` with reminder mode, required autonomous execution prompt semantics, the fixed tool policy for this feature, and background execution lifecycle schemas.
- [x] [T002] Update `src/reminders/store.ts` migrations, row mapping, insert logic, and due reminder queries to persist and read the new autonomous-task fields.
- [x] [T003] Create `src/reminders/background-execution-store.ts` with LibSQL migration, dedupe-key uniqueness, lifecycle transition helpers, persisted tool usage diagnostics, delivery-retry-safe result storage, and stale-running recovery that marks interrupted runs failed.

## Phase 2: Agent And Prompting

- [x] [T004] Refactor `src/agents/base-agent.ts` to extract a shared Sirimath tool builder while preserving the current interactive agent behavior.
- [x] [T005] Create `src/agents/background-agent.ts` with background-specific instructions and reuse of the shared tool set.
- [x] [T006] Add background prompt construction utilities in `src/reminders/background-runner.ts` or a colocated helper so autonomous runs always produce outbound-ready text and never ask follow-up questions.
- [x] [T006A] Add the fixed autonomous-output formatting rule in the prompt builder and runner so autonomous results always begin with `Proactive update:` and remain distinguishable from ordinary reminder nudges.

## Phase 3: Background Execution Orchestration

- [x] [T007] Create `src/reminders/background-runner.ts` to schedule, run, timeout, record, and deliver autonomous executions using the background agent and execution store.
- [x] [T007A] Add pre-run eligibility and cancellation checks in `src/reminders/background-runner.ts` and `src/reminders/heartbeat.ts` for inactive reminders, missing adapters, invalid conversation IDs, and channel/user access failures, using the explicit `cancelled` versus `failed` mapping defined in the spec.
- [x] [T008] Update `src/reminders/heartbeat.ts` to branch between notify-mode reminders and autonomous-mode executions while preserving quiet-hours suppression for both modes and keeping digest behavior limited to notify-mode reminders.
- [x] [T009] Wire the new background agent and background runner into `src/index.ts`, including execution-store migration and startup recovery for stale runs.

## Phase 4: Channel Delivery And Limits

- [x] [T010] Move Telegram text chunking into reusable channel-side logic and update `src/channels/telegram-channel-adapter.ts` to split outbound proactive messages safely.
- [x] [T011] Update `src/channels/telegram.ts` to reuse the shared Telegram chunking utility so inbound and outbound delivery paths stay consistent.
- [x] [T012] Review `src/reminders/ports/channel-adapter.ts` and adjust the contract only if implementation needs extra metadata; otherwise keep the interface stable and document the constraint.

## Phase 5: Scheduling UX And Task Configuration

- [x] [T013] Extend `src/tools/schedule-reminder.ts` and any related schemas to support autonomous reminder/task creation with execution prompt and mode selection.
- [x] [T013A] Enforce that autonomous reminder creation requires an explicit `executionPrompt` and uses only the `all-interactive-tools` policy in this feature.
- [x] [T014] Update `src/tools/index.ts` exports and any agent wiring affected by the scheduling/tool refactor.
- [x] [T015] Adjust interactive agent instructions in `src/agents/base-agent.ts` only as needed so reminder-only and autonomous task setup can both be expressed clearly.

## Phase 6: Reliability, Observability, And Safety

- [x] [T016] Add structured logging and lifecycle state handling across `src/reminders/background-runner.ts`, `src/reminders/background-execution-store.ts`, and `src/reminders/heartbeat.ts` for generation failures, delivery failures, and recovery paths.
- [ ] [T016A] Persist execution diagnostics including tool usage metadata, lifecycle timestamps, failure reasons, and latency-relevant fields needed to inspect SC-001 through SC-005.
- [T016B] Document or implement the exact persisted timestamp fields and query basis used to evaluate SC-001 and SC-002 from execution records.
- [ ] [T016B] Document or implement the exact persisted timestamp fields and query basis used to evaluate SC-001 and SC-002 from execution records.
- [x] [T017] Enforce bounded execution with a timeout path, timeout-specific failure reason, and non-duplicate retry behavior in `src/reminders/background-runner.ts`.
- [x] [T018] Ensure overlapping executions remain isolated by verifying dedupe keys, execution IDs, reminder advancement rules, and same-row retry semantics across `src/reminders/store.ts` and `src/reminders/background-execution-store.ts`.
- [x] [T018B] Document the feature’s explicit concurrency policy that overlapping runs may still trigger non-idempotent tool side effects; this feature only guarantees execution isolation and outbound deduplication.
- [x] [T018A] Define and implement stale-run recovery semantics so interrupted `running` executions are marked failed with a recovery-specific reason on startup.

## Phase 7: Documentation

- [x] [T019] Update `README.md` to explain reminder-only versus autonomous heartbeat execution, new configuration such as `BACKGROUND_RUN_TIMEOUT_MS`, and operational expectations.
- [x] [T020] Refresh feature docs in `specs/007-background-agent-outbound-execution/quickstart.md` if implementation details materially change during coding.

## Phase 8: Validation

- [x] [T021] [P] Run `npm run typecheck` and resolve any new type errors introduced by the feature.
- [ ] [T022] [P] Run `npm run lint` and resolve any new lint issues introduced by the feature without broad unrelated cleanup.
- [ ] [T023] Perform manual validation for a successful autonomous outbound execution using a real tool such as `fetchUrl` or `getWeather`.
- [ ] [T024] Perform manual validation for failure handling: tool failure, timeout expiry, delivery failure, same-row retry behavior, stale-run recovery on restart, explicit `cancelled` versus `failed` eligibility outcomes, fixed `Proactive update:` formatting, persisted tool diagnostics, SLA timestamp capture, and long-message chunking.

## Dependency Order

- T001 before T002, T003, T013, and T013A.
- T002 before T007A, T008, T013, and T018.
- T003 before T007, T009, T016, T016A, T017, T018, and T018A.
- T003 before T007, T009, T016, T016A, T016B, T017, T018, T018A, and T018B.
- T004 before T005 and T015.
- T005, T006, and T006A before T007.
- T007 before T007A, T008, T009, T016, T016A, T017, T018, and T023.
- T010 before T011 and T024.
- T007A, T008, T009, T010, T013, and T013A before T023.
- T016, T016A, T016B, T017, T018, T018A, and T018B before T024.
- T019 can begin after T009, T013, and T017 clarify final behavior and configuration.
- T021 and T022 should run after implementation tasks are complete.

## Parallel Work Suggestions

- After T001 lands, T003 and T004 can proceed in parallel.
- After T004 lands, T005 and T013 can proceed in parallel.
- After T007 is stable, T007A, T010, and T019 can proceed in parallel.

## Minimum Viable Slice

- Complete T001 through T010, T013, T013A, T016, T016A, T017, T021, T022, and T023 to deliver the first end-to-end autonomous heartbeat execution.
- Complete T011, T018, T018A, T019, T020, and T024 to finish hardening, docs, and regression validation.
