# Tasks: Self-Improving Memory for Sirimath

**Input**: Design documents from `/specs/004-self-improving-memory/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Manual verification per quickstart.md. No automated test suite exists (see CLAUDE.md Commands section).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create src/memory/ directory structure per implementation plan
- [ ] T002 [P] Install neo4j-driver ^5.26.0 and ulid ^2.3.0 dependencies
- [ ] T003 [P] Create src/memory/config.ts for environment variable loading (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, MEMORY_EMBEDDINGS, MEMORY_CONSOLIDATION_CRON)
- [ ] T004 [P] Create src/memory/types.ts with Zod schemas from data-model.md (UserIdentitySchema, ChannelIdentityMappingSchema, PairingCodeSchema, UserProfileSchema, ConversationRecordSchema, MemoryItemSchema, RelationshipSchema, ConsolidationReportSchema, ExtractionResultSchema)
- [ ] T005 [P] Create src/memory/ports/ directory for interface contracts (identity-store.ts, memory-store.ts, consolidator.ts)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Create src/memory/store/neo4j/driver.ts with createNeo4jDriver factory and verifyConnectivity check
- [ ] T007 Create src/memory/store/neo4j/migrations.cypher with Neo4j constraints, indexes, full-text index, and optional vector index
- [ ] T008 Create src/memory/store/neo4j/migrate.ts to apply migrations.cypher idempotently on boot
- [ ] T009 Create src/memory/store/noop/stub.ts for degraded-mode implementation (FR-022 graceful degradation)
- [ ] T010 Create src/memory/extract/redact.ts with regex-based PII redaction (emails, phone numbers, credit-card-like, known secret prefixes)
- [ ] T011 Create src/memory/extract/prompt.ts with system prompt for extraction LLM
- [ ] T012 Create src/memory/extract/schema.ts with Zod schema for generateObject output (ExtractedItemSchema, ExtractedRelationshipSchema, ExtractionResultSchema)
- [ ] T013 Create src/memory/extract/extractor.ts with generateObject wrapper and fire-and-forget extraction logic
- [ ] T014 Create src/memory/retrieve/query-parser.ts to extract entities/intents from user turn
- [ ] T015 Create src/memory/retrieve/retriever.ts with FTS + k-hop + optional vector re-rank logic
- [ ] T016 Create src/memory/scheduler.ts with setInterval-based nightly consolidation driver
- [ ] T017 Create src/memory/index.ts as public barrel exporting MemoryAwareAgent and createMemorySubsystem

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Sirimath Remembers Me Across Conversations (Priority: P1) 🎯 MVP

**Goal**: Enable Sirimath to recall facts, preferences, projects, and decisions across sessions and channels, with strict per-user isolation.

**Independent Test**: Have a conversation on Day 1 mentioning (a) a preference ("I prefer metric units"), (b) a project detail ("I'm migrating to Stripe"), (c) a decision ("We chose React Query over SWR"). On Day 2, start a new session and ask questions requiring each piece of context. All three should be recalled accurately and attributed to the earlier conversation.

### Implementation for User Story 1

- [ ] T018 [P] [US1] Implement IdentityStore interface in src/memory/ports/identity-store.ts (resolveOrCreate, issuePairingCode, consumePairingCode, listChannels)
- [ ] T019 [P] [US1] Implement MemoryStore interface in src/memory/ports/memory-store.ts (persistConversationRecord, addMemoryItem, addRelationship, retrieve, viewProfile, exportAll, forgetItem, eraseAll, attribute, listConsolidationReports)
- [ ] T020 [P] [US1] Implement Consolidator interface in src/memory/ports/consolidator.ts (runOnce, startScheduled, stopScheduled)
- [ ] T021 [P] [US1] Create src/memory/store/neo4j/identity-store.ts with Cypher MERGE for UserIdentity and ChannelIdentityMapping nodes
- [ ] T022 [P] [US1] Create src/memory/store/neo4j/memory-store.ts with ingest, retrieve, forget, export, erase methods using Cypher queries
- [ ] T023 [P] [US1] Create src/memory/store/neo4j/consolidator.ts with 5-pass consolidation in Cypher (seed, BFS, centrality, temporal, contradiction)
- [ ] T024 [US1] Create src/memory/agent-facade.ts with MemoryAwareAgent wrapper that integrates retrieval and extraction
- [ ] T025 [US1] Create src/memory/control/profile.ts for /memory view functionality
- [ ] T026 [US1] Create src/memory/control/forget.ts for /forget functionality
- [ ] T027 [US1] Create src/memory/control/export.ts for /export functionality
- [ ] T028 [US1] Create src/memory/control/erase.ts for /erase functionality
- [ ] T029 [US1] Create src/memory/control/link.ts for /memory link (pairing code) functionality
- [ ] T030 [P] [US1] Create src/memory/tools/memory-recall.tool.ts for memoryRecall tool definition
- [ ] T031 [P] [US1] Create src/memory/tools/memory-add.tool.ts for memoryAdd tool definition
- [ ] T032 [P] [US1] Create src/memory/tools/memory-forget.tool.ts for memoryForget tool definition
- [ ] T033 [P] [US1] Create src/memory/tools/memory-profile.tool.ts for memoryProfile tool definition
- [ ] T034 [P] [US1] Create src/memory/tools/memory-export.tool.ts for memoryExport tool definition
- [ ] T035 [P] [US1] Create src/memory/tools/memory-erase.tool.ts for memoryErase tool definition
- [ ] T036 [P] [US1] Create src/memory/tools/memory-link-start.tool.ts for memoryLinkStart tool definition
- [ ] T037 [P] [US1] Create src/memory/tools/memory-link-confirm.tool.ts for memoryLinkConfirm tool definition
- [ ] T038 [P] [US1] Create src/memory/tools/memory-consolidate.tool.ts for memoryConsolidate tool definition
- [ ] T039 [US1] Create src/channels/dryrun.ts as stdin/stdout channel adapter for SC-009 validation
- [ ] T040 [US1] Edit src/index.ts to wire MemoryAwareAgent if NEO4J_URI set, following integration code snippet
- [ ] T041 [US1] Edit src/channels/telegram.ts to pass channel metadata (channel, channelUserId) to agent.generateText

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Sirimath Answers Using Compounded Knowledge (Priority: P2)

**Goal**: Enable Sirimath to synthesize answers that draw on patterns and connections across all past conversations, not just the most recent one.

**Independent Test**: Over several sessions, tell Sirimath about three separate projects that each involve the same entity (e.g., "PostgreSQL"). Then ask "What have I built with PostgreSQL?" Sirimath should produce a coherent answer referencing all three projects.

### Implementation for User Story 2

- [ ] T042 [P] [US2] Enhance src/memory/retrieve/retriever.ts with k-hop graph expansion logic (1-2 hop traversal from keyword matches)
- [ ] T043 [P] [US2] Enhance src/memory/retrieve/retriever.ts with LLM re-rank of combined candidate set (up to ~24 items)
- [ ] T044 [P] [US2] Enhance src/memory/store/neo4j/memory-store.ts retrieve method to support analytical retrieval mode (FR-011)
- [ ] T045 [US2] Add contradiction detection logic to src/memory/store/neo4j/consolidator.ts (FR-013)
- [ ] T046 [US2] Implement supersession tracking in src/memory/store/neo4j/memory-store.ts (FR-014: mark older facts as historical)
- [ ] T047 [US2] Add attribution helper to src/memory/store/neo4j/memory-store.ts (FR-010: trace item back to conversation)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Memory Stays Healthy Automatically (Priority: P3)

**Goal**: Enable automatic memory consolidation that merges duplicates, prunes stale items, records supersessions, and surfaces contradictions.

**Independent Test**: Populate memory with 50+ conversations including duplicates, updates, and never-revisited items. Trigger consolidation and verify: duplicates merged, superseded facts marked historical, never-revisited items older than retention window removed, summary available for review.

### Implementation for User Story 3

- [ ] T048 [P] [US3] Implement 5-pass consolidation in src/memory/store/neo4j/consolidator.ts (seed → BFS → centrality → temporal → contradiction)
- [ ] T049 [P] [US3] Add duplicate detection logic using LLM judgment over FTS-derived candidate pairs
- [ ] T050 [P] [US3] Implement stale pruning logic (items older than 90 days, not decisions, low access frequency)
- [ ] T051 [P] [US3] Add ConsolidationReport persistence to src/memory/store/neo4j/consolidator.ts
- [ ] T052 [US3] Implement proactive contradiction surfacing at conversation start in src/memory/agent-facade.ts (FR-016a)
- [ ] T053 [US3] Add consolidation summary retrieval to src/memory/store/neo4j/memory-store.ts (FR-016)
- [ ] T054 [US3] Wire consolidation scheduler in src/memory/scheduler.ts to run daily at configurable time

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T055 [P] Add structured pino logging to all memory operations (userIdentity, traceId, counts, latency)
- [ ] T056 [P] Implement graceful degradation in src/memory/index.ts (missing NEO4J_URI → no-op stub)
- [ ] T057 [P] Add error handling and retry logic for Neo4j connection failures
- [ ] T058 [P] Implement optional vector index migration gated on MEMORY_EMBEDDINGS env var
- [ ] T059 [P] Add rate limiting and backoff to extraction LLM calls
- [ ] T060 [P] Implement confirmation prompts for destructive operations (forget, erase) in tool handlers
- [ ] T061 [P] Add redaction of channelNativeId in structured logs (identity privacy boundary)
- [ ] T062 [P] Validate all Cypher queries include userIdentity predicate (FR-009 isolation)
- [ ] T063 [P] Add integration with existing VoltAgent short-term conversation history store
- [ ] T064 [P] Update .env.example with new memory-related environment variables
- [ ] T065 [P] Update Dockerfile documentation for Neo4j out-of-process deployment
- [ ] T066 [P] Create docker-compose.dev.yml for local development with Neo4j
- [ ] T067 Run npm run typecheck to verify TypeScript strict mode compliance
- [ ] T068 Run npm run lint to verify Biome linting compliance
- [ ] T069 Run npm run build to verify successful compilation
- [ ] T070 Run quickstart.md validation steps 1-10 to verify SC-001, SC-002, SC-003, SC-004, SC-005, SC-009
- [ ] T071 [P] Add explicit command wiring in channel adapters for /memory, /forget, /export, /erase (FR-020b)
- [ ] T072 [P] Extend quickstart.md validation to measure SC-006 and SC-007 timing thresholds

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Builds on US1 retrieval foundation but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Builds on US1/US2 data structures but independently testable

### Within Each User Story

- Interface contracts before implementations
- Store implementations before agent façade
- Core implementation before control surface
- Control surface before tool definitions
- Tool definitions before channel integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All interface contracts for a user story marked [P] can run in parallel
- All store implementations for a user story marked [P] can run in parallel
- All tool definitions for a user story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all interface contracts for User Story 1 together:
Task: "Implement IdentityStore interface in src/memory/ports/identity-store.ts"
Task: "Implement MemoryStore interface in src/memory/ports/memory-store.ts"
Task: "Implement Consolidator interface in src/memory/ports/consolidator.ts"

# Launch all store implementations for User Story 1 together:
Task: "Create src/memory/store/neo4j/identity-store.ts with Cypher MERGE"
Task: "Create src/memory/store/neo4j/memory-store.ts with ingest, retrieve, forget, export, erase"
Task: "Create src/memory/store/neo4j/consolidator.ts with 5-pass consolidation"

# Launch all tool definitions for User Story 1 together:
Task: "Create src/memory/tools/memory-recall.tool.ts"
Task: "Create src/memory/tools/memory-add.tool.ts"
Task: "Create src/memory/tools/memory-forget.tool.ts"
Task: "Create src/memory/tools/memory-profile.tool.ts"
Task: "Create src/memory/tools/memory-export.tool.ts"
Task: "Create src/memory/tools/memory-erase.tool.ts"
Task: "Create src/memory/tools/memory-link-start.tool.ts"
Task: "Create src/memory/tools/memory-link-confirm.tool.ts"
Task: "Create src/memory/tools/memory-consolidate.tool.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently per quickstart.md
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (core memory persistence and retrieval)
   - Developer B: User Story 2 (compounded knowledge synthesis)
   - Developer C: User Story 3 (automatic consolidation)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Manual verification per quickstart.md instead of automated tests
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- Neo4j runs out-of-process; Sirimath Dockerfile remains single-artefact
- Graceful degradation preserved via FR-022 (missing NEO4J_URI → agent stateless)
- All Cypher queries MUST include userIdentity predicate for FR-009 isolation
