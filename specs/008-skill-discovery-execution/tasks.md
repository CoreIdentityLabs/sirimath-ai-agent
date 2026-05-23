# Tasks: Skill Discovery Execution

**Input**: Design documents from `/specs/008-skill-discovery-execution/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No dedicated automated test suite is configured. This task list includes required validation work using `npm run typecheck`, `npm run lint`, and manual conversational validation from `specs/008-skill-discovery-execution/quickstart.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., [US1], [US2], [US3])
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the feature scaffolding and identify the exact shared entry points for installed-skill support.

- [X] T001 Review installed skill artifacts under `skills/` and confirm sample malformed and valid cases for manual validation in `skills/`
- [X] T002 Review existing skill tool patterns and shared agent assembly in `src/tools/find-skills.ts`, `src/tools/install-skill.ts`, `src/tools/index.ts`, `src/agents/agent-tools.ts`, and `src/agents/base-agent.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared installed-skill parsing and normalization layer used by all user stories.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [X] T003 Create installed-skill schemas, normalization helpers, and filesystem readers in `src/tools/shared/installed-skills.ts`
- [X] T004 [P] Add defensive parsing for `skills/*/_meta.json` and `skills/*/SKILL.md` with warning accumulation in `src/tools/shared/installed-skills.ts`
- [X] T005 [P] Implement summary, usage-guidance, and lookup normalization utilities for installed skills in `src/tools/shared/installed-skills.ts`
- [X] T006 Add explicit missing or unreadable `skills/` directory handling with user-safe fallback results in `src/tools/shared/installed-skills.ts`
- [X] T007 Export any shared installed-skill types or helpers needed by downstream tools from `src/tools/shared/installed-skills.ts`

**Checkpoint**: Installed-skill catalog loading is available for user-story tools and agent integration.

---

## Phase 3: User Story 1 - Discover Installed Skills (Priority: P1) 🎯 MVP

**Goal**: Let users ask what skills are already installed and receive a clear, human-readable summary of current capabilities.

**Independent Test**: Run Sirimath locally, ask what installed skills are available, and verify the response lists installed local skills with concise summaries or returns a clear empty-state plus extension guidance.

### Implementation for User Story 1

- [X] T008 [US1] Implement the `listInstalledSkills` tool with empty-state handling in `src/tools/list-installed-skills.ts`
- [X] T009 [US1] Format installed skill list output with display names, short summaries, optional warning text, and a clear next step when no installed skill exists in `src/tools/list-installed-skills.ts`
- [X] T010 [US1] Export `listInstalledSkills` from `src/tools/index.ts`
- [X] T011 [US1] Register `listInstalledSkills` in shared agent tool assembly in `src/agents/agent-tools.ts`
- [X] T012 [US1] Update base-agent instructions to call `listInstalledSkills` when users ask about installed capabilities in `src/agents/base-agent.ts`
- [ ] T013 [US1] Validate User Story 1 with `npm run typecheck`, `npm run lint`, and the installed-skill listing prompts from `specs/008-skill-discovery-execution/quickstart.md`, including missing or unreadable `skills/` directory behavior

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - Inspect Skill Details (Priority: P2)

**Goal**: Let users inspect a specific installed skill and understand when to use it, including clear handling for missing or incomplete skills.

**Independent Test**: Ask Sirimath to explain a known installed skill and a missing skill, then verify the response summarizes purpose, use cases, and constraints from the installed definition without crashing on missing or malformed files.

### Implementation for User Story 2

- [X] T014 [US2] Implement the `readInstalledSkill` lookup and detail tool in `src/tools/read-installed-skill.ts`
- [X] T015 [US2] Add slug, normalized-name, and single-clear-partial match resolution plus ambiguous-match messaging in `src/tools/read-installed-skill.ts`
- [X] T016 [US2] Format detailed skill responses with purpose, recommended use cases, limitations, and availability status in `src/tools/read-installed-skill.ts`
- [X] T017 [US2] Export `readInstalledSkill` from `src/tools/index.ts`
- [X] T018 [US2] Register `readInstalledSkill` in shared agent tool assembly in `src/agents/agent-tools.ts`
- [X] T019 [US2] Update base-agent instructions to inspect installed skills before answering explicit skill-detail questions in `src/agents/base-agent.ts`
- [ ] T020 [US2] Validate User Story 2 with `npm run typecheck`, `npm run lint`, and the installed-skill inspection prompts from `specs/008-skill-discovery-execution/quickstart.md`, confirming tool-backed inspection for explicit detail requests

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Use Skills to Bridge Capability Gaps (Priority: P3)

**Goal**: Make Sirimath use relevant installed skill guidance during normal task handling while preserving general assistant behavior when no local skill applies.

**Independent Test**: Ask Sirimath for help with one task covered by an installed skill and one uncovered task, then verify the first response reflects installed skill guidance and the second falls back to normal help plus extension guidance when appropriate.

### Implementation for User Story 3

- [X] T021 [US3] Update base-agent instructions for skill-aware task routing, relevance preference, and fallback behavior in `src/agents/base-agent.ts`
- [X] T022 [US3] Add skill-aware guidance selection wording so the agent inspects relevant installed skills before answering matching user tasks in `src/agents/base-agent.ts`
- [X] T023 [US3] Ensure the agent still points users to remote discovery and installation when no installed skill applies by updating `src/agents/base-agent.ts`
- [X] T024 [US3] Review and adjust shared tool ordering or naming in `src/agents/agent-tools.ts` and `src/tools/index.ts` so installed-skill tools coexist cleanly with `findSkills` and `installSkill`
- [ ] T025 [US3] Validate User Story 3 with `npm run typecheck`, `npm run lint`, and the task-driven prompts from `specs/008-skill-discovery-execution/quickstart.md`, including overlapping-skill relevance selection and explicit extension guidance when no skill applies

**Checkpoint**: All user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Tighten documentation, resilience, and final validation across all stories.

- [X] T026 [P] Update feature-facing documentation for installed skill discovery and usage in `README.md` if the new capability should be advertised to users
- [X] T027 [P] Add or refine structured error handling messages for malformed local skills and unreadable `skills/` directory access in `src/tools/shared/installed-skills.ts`, `src/tools/list-installed-skills.ts`, and `src/tools/read-installed-skill.ts`
- [ ] T028 Define and follow a lightweight manual evaluation rubric for SC-002, SC-003, and SC-004 using `specs/008-skill-discovery-execution/quickstart.md`
- [ ] T029 Run the full quickstart validation flow from `specs/008-skill-discovery-execution/quickstart.md` and confirm each expected outcome is satisfied for the documented prompt set

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies, can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion
- **User Story 2 (Phase 4)**: Depends on Foundational completion and remains independently testable
- **User Story 3 (Phase 5)**: Depends on Foundational completion and on the installed-skill tools from User Stories 1 and 2 being available
- **Polish (Phase 6)**: Depends on the user stories selected for delivery

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Phase 2 and forms the MVP
- **User Story 2 (P2)**: Starts after Phase 2 and can be delivered independently once the shared installed-skill reader exists
- **User Story 3 (P3)**: Starts after User Stories 1 and 2 expose installed-skill listing and inspection tools to the agent

### Within Each User Story

- Shared installed-skill parsing must exist before tool implementation
- Tool implementation must precede tool export and registration
- Tool registration must precede base-agent instruction updates that rely on those tools
- Static validation and manual conversational validation complete each story

### Parallel Opportunities

- `T004` and `T005` can run in parallel once `T003` creates the shared helper structure
- `T026` and `T027` can run in parallel during polish
- If multiple developers are available after Phase 2, one can focus on `listInstalledSkills` while another prepares `readInstalledSkill`, but User Story 3 should wait until both tools are integrated

---

## Parallel Example: User Story 1

```bash
# After T007 is in place, these tasks can proceed independently:
Task: "Format installed skill list output with display names, short summaries, and optional warning text in src/tools/list-installed-skills.ts"
Task: "Export listInstalledSkills from src/tools/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Stop and validate installed-skill listing behavior with quickstart prompts

### Incremental Delivery

1. Build shared installed-skill parsing once in Phase 2
2. Deliver User Story 1 for immediate visibility into installed capabilities
3. Add User Story 2 for detailed installed-skill inspection
4. Add User Story 3 for skill-aware task handling and capability-gap guidance
5. Finish with polish, rubric-based evaluation, and full quickstart validation

### Parallel Team Strategy

1. One developer builds the shared installed-skill reader in `src/tools/shared/installed-skills.ts`
2. After Phase 2, one developer implements `src/tools/list-installed-skills.ts` while another implements `src/tools/read-installed-skill.ts`
3. A final pass integrates both tools into `src/agents/agent-tools.ts` and `src/agents/base-agent.ts`

---

## Notes

- [P] tasks indicate different files or independent follow-up work with no direct dependency conflict
- User-story labels provide traceability back to the feature specification
- Each user story includes both static validation and manual conversational validation because no automated test suite is configured
- Avoid introducing a separate skill runtime or persistence layer; this feature stays file-based and tool-driven
