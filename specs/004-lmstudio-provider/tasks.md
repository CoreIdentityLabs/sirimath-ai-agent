---

description: "Task list for 004-lmstudio-provider"
---

# Tasks: Add LM Studio Model Provider

**Input**: Design documents from `/specs/004-lmstudio-provider/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅ (N/A), quickstart.md ✅

**Tests**: Not requested — no test tasks included. Verification is via `npm run typecheck`, `npm run lint`, `npm run build`, and manual smoke test.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in all descriptions

---

## Phase 1: Setup (Package Installation)

**Purpose**: Install the one new dependency required before any code changes.

- [x] T001 Add `@ai-sdk/openai-compatible` to `package.json` dependencies and lock it by running `npm install @ai-sdk/openai-compatible` in the repository root

**Checkpoint**: `node_modules/@ai-sdk/openai-compatible` exists and `package-lock.json` is updated — user story implementation can begin

---

## Phase 2: Foundational (Blocking Prerequisites)

No foundational tasks for this feature beyond T001. The package installation in Phase 1 is the only blocker. All user story phases can begin once T001 is complete.

---

## Phase 3: User Story 1 — Run Sirimath AI with a Local LM Studio Model (Priority: P1) 🎯 MVP

**Goal**: Operator sets `MODEL_PROVIDER=lmstudio` and `MODEL_ID=<loaded-model>`, starts Sirimath AI with LM Studio's local server running, and receives streaming chat responses — no cloud credentials required.

**Independent Test**: With LM Studio running and `llama-3.2-1b` loaded, set `MODEL_PROVIDER=lmstudio MODEL_ID=llama-3.2-1b npm run dev` — send a Telegram message and receive a coherent streaming response with no `OPENAI_API_KEY` or other cloud credential set.

### Implementation for User Story 1

- [x] T002 [US1] Add `"lmstudio"` to the `SUPPORTED_PROVIDERS` array in `src/config/model-provider.ts` (after `"ollama"` on line 10), keeping the `as const` assertion
- [x] T003 [US1] Add the `lmstudio` case to the `resolveModel()` switch in `src/config/model-provider.ts` after the `ollama` case (line 86):
  ```typescript
  case "lmstudio": {
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    const baseURL =
      process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1";
    const lmstudio = createOpenAICompatible({ name: "lmstudio", baseURL });
    return lmstudio(modelId);
  }
  ```
  No `apiKey` — LM Studio server is unauthenticated by default. Dynamic `import()` keeps the package optional at runtime.
- [x] T004 [P] [US1] Run `npm run typecheck` to verify `ProviderName` type union extends to include `"lmstudio"` with zero TypeScript errors
- [x] T005 [P] [US1] Run `npm run lint` to verify Biome passes with zero warnings on `src/config/model-provider.ts`

**Checkpoint**: `MODEL_PROVIDER=lmstudio` is accepted; basic local model chat is functional; typecheck and lint green

---

## Phase 4: User Story 2 — Configure a Custom LM Studio Server Address (Priority: P2)

**Goal**: Operator can override the default `http://localhost:1234/v1` via `LMSTUDIO_BASE_URL` to target non-default ports or a remote host — no code changes required, env var only.

**Independent Test**: Set `LMSTUDIO_BASE_URL=http://192.168.1.50:5678/v1` with LM Studio running and listening on all interfaces at that address; Sirimath AI connects and responds correctly.

### Implementation for User Story 2

- [x] T006 [P] [US2] Add the LM Studio section to `.env.example` immediately after the Ollama block, documenting `MODEL_PROVIDER`, `MODEL_ID`, and the optional `LMSTUDIO_BASE_URL` override:
  ```env
  # ─── LM Studio (Local Models) ──────────────────────────────
  # No API key required. LM Studio must be running with its local server started.
  # Install: https://lmstudio.ai
  # Start server: LM Studio → Local Server tab → Start Server
  # MODEL_PROVIDER=lmstudio
  # MODEL_ID=llama-3.2-1b       # Use exact model ID from LM Studio UI
  # Optional: override if LM Studio runs on a custom port or remote host
  # LMSTUDIO_BASE_URL=http://localhost:1234/v1
  ```
  Note: The `LMSTUDIO_BASE_URL` env var is already consumed in the switch case added in T003 — this task adds only the `.env.example` documentation.

**Checkpoint**: `LMSTUDIO_BASE_URL` override is documented; US1 and US2 both independently verifiable

---

## Phase 5: User Story 3 — Clear Error When LM Studio Server Is Not Running (Priority: P3)

**Goal**: When `MODEL_PROVIDER=lmstudio` is set but the LM Studio server is stopped, Sirimath AI surfaces an `ECONNREFUSED` error within 5 seconds rather than hanging on retries. No code change is expected — Node.js raises `ECONNREFUSED` immediately on a closed local port, and the AI SDK surfaces it to VoltAgent.

**Independent Test**: Set `MODEL_PROVIDER=lmstudio MODEL_ID=llama-3.2-1b`, stop the LM Studio server, send a chat message, and confirm an error (not a hang) appears within 5 seconds.

### Implementation for User Story 3

- [x] T007 [US3] Verify fast-fail behavior by running Sirimath AI with `MODEL_PROVIDER=lmstudio` and the LM Studio server stopped; confirm `ECONNREFUSED` (or equivalent) is surfaced in the logs within 5 seconds — no code change expected, this is a behavioural gate
- [x] T008 [US3] Confirm the `ECONNREFUSED localhost:1234` row in the Troubleshooting table in `specs/004-lmstudio-provider/quickstart.md` matches the actual error message observed in T007; update wording if needed

**Checkpoint**: Fast-fail behaviour confirmed; troubleshooting docs reflect actual runtime error messages

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation completeness and final CI/build verification across all user stories.

- [x] T009 [P] Update `README.md` supported providers section to add a LM Studio row: provider `LM Studio`, `MODEL_PROVIDER` value `lmstudio`, API key required `No`, notes `Local model — requires LM Studio running with server started`
- [x] T010 Run `npm run build` to verify the production bundle builds cleanly with the new provider case and dependency
- [ ] T011 Manual end-to-end smoke test per `specs/004-lmstudio-provider/quickstart.md`: run Sirimath AI with `MODEL_PROVIDER=lmstudio` and a loaded model, confirm chat response streams correctly from the local model

**Checkpoint**: All 4 source files updated, CI gates (typecheck + lint + build) green, smoke test passed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: N/A for this feature
- **User Stories (Phase 3–5)**: All depend on Phase 1 (T001) completing
  - US1 (Phase 3) and US2 (Phase 4) can proceed in parallel after T001
  - US3 (Phase 5) depends on Phase 3 completing (needs running provider to verify)
- **Polish (Phase 6)**: Depends on all user story phases completing

### User Story Dependencies

- **US1 (P1)**: Starts after T001 — no dependency on other stories
- **US2 (P2)**: Starts after T001 — `LMSTUDIO_BASE_URL` support is already coded in T003 (US1); T006 only adds `.env.example` docs and can run in parallel with T002/T003
- **US3 (P3)**: Starts after T003 (needs the switch case deployed to test fail-fast)

### Within Each User Story

- T002 before T003 (same file — extend array before adding the case)
- T003 before T004/T005 (typecheck/lint must see the complete change)
- T004 and T005 can run in parallel (different concerns)
- T006 is independent of T002/T003 (different file — `.env.example`)

---

## Parallel Opportunities

### User Story 1 (after T001 complete)

```bash
# Sequential pair (same file):
T002 → T003: src/config/model-provider.ts

# Then parallel:
T004: npm run typecheck
T005: npm run lint
```

### User Story 2 (after T001 complete, independently of US1)

```bash
# Fully independent:
T006: .env.example  ← can run at any time after T001
```

### Polish Phase (after all stories complete)

```bash
# Parallel documentation:
T009: README.md

# Sequential verification:
T010: npm run build
T011: manual smoke test (needs T010 passing)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: `npm install @ai-sdk/openai-compatible`
2. Complete Phase 3: T002 → T003 → T004 + T005
3. **STOP and VALIDATE**: Test `MODEL_PROVIDER=lmstudio` with LM Studio running
4. Deploy / demo MVP

### Incremental Delivery

1. T001 (package install) → Foundation ready
2. T002 + T003 + T004 + T005 → US1 working (core value delivered) → Deploy/Demo
3. T006 → US2 documented → Deploy/Demo
4. T007 + T008 → US3 verified → Deploy/Demo
5. T009 + T010 + T011 → Feature complete

### Single Developer (Sequential)

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011

Total: 11 tasks across 4 source files — estimated at under 1 hour for the full implementation.

---

## Notes

- [P] tasks operate on different files or independent concerns — safe to run in parallel
- [Story] labels map each task to its user story for traceability to spec.md acceptance criteria
- T007 is a verification-only task — if behaviour is correct (ECONNREFUSED within 5 s), no code change is made
- Commit after T003+T004+T005 pass as a natural checkpoint for US1 delivery
- The `@ai-sdk/openai-compatible` package may still be in `3.0.0-beta.x` — pin explicitly if `^3.0.0` does not resolve at install time (see risk register in plan.md)
