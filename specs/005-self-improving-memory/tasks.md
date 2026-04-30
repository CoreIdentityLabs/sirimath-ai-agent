# Tasks: Self-Improving Memory for Sirimath

**Feature branch**: `005-self-improving-memory`
**Input**: [spec.md](./spec.md) · [plan.md](./plan.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/](./contracts/)
**Generated**: 2026-04-30

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: parallelizable (different files, no pending dependencies in this phase)
- **[US1/US2/US3]**: user story label (matches spec.md priority order)
- No label = Setup or Foundational phase task

---

## Dependency graph

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational — blocks all user stories)
    ↓ ↓ ↓ (all three stories can start once Phase 2 completes)
Phase 3 (US1 P1 — MVP)     independent
Phase 4 (US2 P2)            can start after Phase 3 retriever + facade exist
Phase 5 (US3 P3)            can start after Phase 3 ingest + identity exist
    ↓
Phase 6 (Polish — after all story phases)
```

US2 has one dependency on Phase 3: it augments the retriever and memory-store created in Phase 3.
US3 has one dependency on Phase 3: it extends identity-store and memory-store created in Phase 3.
All other tasks within each phase are independent unless noted.

---

## Parallel execution examples

**Phase 2** (after T003): T004, T005, T006, T007 can run simultaneously.  
**Phase 3** (after T013): T014, T015, T016, T020, T022, T025 can run simultaneously.  
**Phase 4** (after T026): T027, T028, T030, T031 can run simultaneously.  
**Phase 5B** (after T039–T040): T041, T042, T043 can run simultaneously.  
**Phase 5C–5E**: all sub-phases can run in parallel once Phase 5A consolidator.ts exists.

---

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 only.**  
After Phase 3 all US1 acceptance scenarios pass: cross-session recall (SC-001), per-user isolation (SC-003), ≤1 s latency overhead (SC-004), channel-agnostic identity. Phases 4 and 5 are independent increments.

---

## Phase 1: Setup

**Purpose**: Add new runtime dependencies and document env vars so every subsequent task can reference them.

- [ ] T001 Install `neo4j-driver@^5.26.0` and `ulid@^2.3.0` via npm in `package.json`
- [ ] T002 [P] Add `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `MEMORY_EMBEDDINGS`, `MEMORY_CONSOLIDATION_CRON` entries with descriptions to `.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core schemas, port interfaces, Neo4j driver + migrations, and degraded-mode stub that every user story implementation builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T003 Create Zod schemas for all 8 entities (UserIdentity, ChannelIdentityMapping, PairingCode, UserProfile, ConversationRecord, MemoryItem, Relationship, ConsolidationReport) plus ExtractionResult (`ExtractedItemSchema`, `ExtractedRelationshipSchema`, `ExtractionResultSchema`) from data-model.md §2 in `src/memory/schema.ts` — this is the **single canonical source** for all domain types; no other file may re-declare these schemas
- [ ] T004 [P] Create `src/memory/config.ts` loading `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `MEMORY_EMBEDDINGS`, `MEMORY_CONSOLIDATION_CRON` from `process.env` with a typed `MemoryConfig` interface and defaults
- [ ] T005 [P] Create `src/memory/ports/identity-store.ts` with the `IdentityStore` interface (`resolveOrCreate`, `issuePairingCode`, `consumePairingCode`, `listChannels`) per `contracts/memory-service.contract.md`
- [ ] T006 [P] Create `src/memory/ports/memory-store.ts` with the `MemoryStore` interface (`persistConversationRecord`, `addMemoryItem`, `addRelationship`, `retrieve`, `viewProfile`, `exportAll`, `forgetItem`, `eraseAll`, `attribute`, `listConsolidationReports`) per `contracts/memory-service.contract.md`
- [ ] T007 [P] Create `src/memory/ports/consolidator.ts` with the `Consolidator` interface (`runOnce`, `startScheduled`) per `contracts/memory-service.contract.md`
- [ ] T008 Create `src/memory/store/neo4j/migrations.cypher` with all uniqueness constraints, range indexes, and the `memoryItemDesc` full-text index from data-model.md §3 (each statement uses `IF NOT EXISTS`)
- [ ] T009 Create `src/memory/store/neo4j/driver.ts` with `createNeo4jDriver` factory: calls `driver.verifyConnectivity()` at startup, returns `null` and logs a warning on failure (graceful degradation per research.md §2, plan.md §2.1 snippet)
- [ ] T010 Create `src/memory/store/neo4j/migrate.ts` that reads `migrations.cypher`, splits on `;\n`, and runs each statement in `session.executeWrite` (idempotent; plan.md §2.2 snippet)
- [ ] T011 [P] Create `src/memory/store/noop/stub.ts` with no-op `IdentityStore`, `MemoryStore`, and `Consolidator` implementations that return `{ disabled: true, message: "Memory is currently unavailable" }` for every call (FR-022)
- [ ] T012 Create `src/memory/index.ts` public barrel exporting `createMemorySubsystem(cfg, model, log)` factory: calls `createNeo4jDriver`, applies migrations if driver non-null, builds Neo4j adapters (or noop stubs), and returns `{ identityStore, memoryStore, consolidator }` plus a `wrap(agent)` helper; in degraded mode the `wrap` helper returns an adapter that appends `'\n\n⚠️ Long-term memory is temporarily unavailable.'` as a footer to `response.text` so users know recall is impaired (FR-022 — assistant never fails to respond, but silently suppressing the outage is not acceptable)

**Checkpoint**: Foundation ready — all port interfaces, driver lifecycle, and degraded-mode path are in place.

---

## Phase 3: User Story 1 — Sirimath Remembers Me Across Conversations (P1) 🎯 MVP

**Goal**: On every turn, extract memorable facts from the exchange and persist them; before every turn, retrieve relevant prior facts and inject them into the system prompt; isolate all memory strictly by `userIdentity`.

**Independent Test**: Run quickstart.md §1 (schema boot), §2 (cross-session recall: preference + project + decision survive a process restart), §3 (isolation: second user gets zero leakage), and §9 (degraded-mode: agent replies normally when Neo4j is unreachable). All must pass.

- [ ] T013 Create `src/memory/store/neo4j/identity-store.ts` implementing `IdentityStore.resolveOrCreate` using Cypher `MERGE (cim:ChannelIdentityMapping {channel, channelUserId})` + `MERGE (:UserIdentity)` + `MERGE (cim)-[:BELONGS_TO]->(u)` pattern from plan.md §2.3; `issuePairingCode` and `consumePairingCode` are stubs returning `"not implemented"` for now
- [ ] T014 [P] [US1] Create `src/memory/extract/redact.ts` with `redactSensitive(text: string): string` applying regex patterns for emails, phone numbers, credit-card-like sequences, and known secret prefixes (`sk-`, `ghp_`, `xoxb-`, `Bearer `) per research.md §6; replaces matches with `[REDACTED:<kind>]`
- [ ] T015 [P] [US1] Create `src/memory/extract/schema.ts` as a **re-export barrel** that simply re-exports `ExtractionResultSchema`, `ExtractedItemSchema`, and `ExtractedRelationshipSchema` from `../schema.js` — do NOT redeclare them here; this file exists so the extract/ module has a stable local import path (A1 resolution: canonical definition lives in T003's `src/memory/schema.ts`)
- [ ] T016 [P] [US1] Create `src/memory/extract/prompt.ts` exporting `extractionSystemPrompt: string` that instructs the LLM to extract entities, concepts, decisions, preferences, and events from a user+assistant exchange as JSON; instructs it to refuse items that look like credentials or secrets
- [ ] T017 [US1] Create `src/memory/extract/extractor.ts` exporting `extract(model, userIdentity, userTurn, assistantTurn, conversationId, log)` that redacts input via `redact.ts`, calls `generateObject` with `ExtractionResultSchema` and `maxRetries: 1`, assigns a `ulid()` itemId to each item, and logs counts + latency (plan.md §2.6 snippet)
- [ ] T018 [US1] Create `src/memory/store/neo4j/memory-store.ts` implementing `persistConversationRecord` (MERGE on `(userIdentity, conversationId)`) and `ingest` (batch MERGE for MemoryItem nodes + OWNED_BY edges + 7 hard-coded relationship-type MERGE queries as the APOC-free variant per plan.md §2.4 note); all other MemoryStore methods are stubs returning empty results
- [ ] T019 [US1] Create `src/memory/retrieve/retriever.ts` implementing the `retrieve(driver, userIdentity, query, limit)` function: `sanitizeFtsQuery`, `CALL db.index.fulltext.queryNodes('memoryItemDesc', $q)` scoped to `userIdentity`, 1-2 hop Cypher expansion, fire-and-forget `accessCount + lastAccessedAt` bump (plan.md §2.5 snippet); no LLM re-rank yet (added in Phase 4)
- [ ] T020 [P] [US1] Create `src/memory/retrieve/query-parser.ts` exporting `parseQuery(text: string): string` that extracts the most salient noun phrases from the user turn to use as the FTS query string (simple heuristic: strip stop-words, take up to 10 tokens)
- [ ] T021 [US1] Create `src/memory/agent-facade.ts` implementing `createMemoryAwareAgent(deps)` with `generateText`: resolves identity → retrieves memories → formats them as a Markdown preamble injected via `systemPromptAdditions` (profile facts arrive via VoltAgent Working Memory automatically, per research.md §11) → calls `inner.generateText` → fires-and-forgets extraction + ingest (plan.md §2.7 snippet). **FR-005 note**: the `text` parameter received by the facade is already the final post-transcription string — voice messages have been converted to text by `azure-voice-provider.ts` / OpenAI Whisper before reaching this layer; no special handling is needed here
- [ ] T022 [P] [US1] Create `src/memory/tools/memory-search.tool.ts` implementing `memorySearchTool` via `createTool` per `contracts/memory-tools.contract.md` §memorySearch; reads `userIdentity` from `operationContext.userId`; calls `memoryStore.retrieve`
- [ ] T023 [US1] Edit `src/index.ts` to import `createMemorySubsystem`, call it after the base `Agent` is built, and replace `agent` with `memory.wrap(agent)` — no-op in degraded mode (plan.md §2.9 snippet)
- [ ] T024 [US1] Edit `src/channels/telegram.ts` to pass `channel: "telegram"` and `channelUserId: String(ctx.from.id)` to every `agent.generateText` call (plan.md §2.10 — the only required line change in the Telegram adapter)
- [ ] T025 [P] [US1] Create `src/channels/dryrun.ts` stdin/stdout adapter with `CHANNEL_NAME = "dryrun"` and `channelNativeUserId = "dryrun:<arg0>"` wiring to `memoryAwareAgent.generateText` — proves zero changes needed in `src/memory/` for a new channel (SC-009, `channel-integration.contract.md` §SC-009)

---

## Phase 4: User Story 2 — Sirimath Answers Using Compounded Knowledge (P2)

**Goal**: Synthesis queries drawing on all past facts via k-hop traversal + LLM re-rank; profile view with attribution; Working Memory dual-write for profile data.

**Independent Test**: Run quickstart.md §4 (multi-project PostgreSQL aggregation query — agent synthesizes answer referencing all three projects without user restating them). Also verify FR-010 attribution: `how do you know that?` returns the source conversation date and topic.

- [ ] T026 [US2] Add LLM re-rank step to `src/memory/retrieve/retriever.ts`: after the FTS + k-hop Cypher step returns up to 24 candidates, call `generateObject` with a `{ itemIds: string[], reason: string }` schema to reorder by relevance and return the top `limit` items (research.md §3 re-rank step). Additionally, classify the query as **analytical** if it contains phrases like `'all decisions'`, `'what have i'`, `'list all'`, `'everything about'`; for analytical queries, follow the re-rank step with a second `generateObject` call using schema `z.object({ items: z.array(z.object({ description: z.string(), date: z.string(), context: z.string() })) })` to return a structured summary — this satisfies FR-011 (analytical structured retrieval mode)
- [ ] T027 [P] [US2] Add `attribute(userIdentity, itemId)` Cypher read to `src/memory/store/neo4j/memory-store.ts`: `MATCH (m:MemoryItem {itemId})-[:OWNED_BY]->(:UserIdentity {userIdentity}) MATCH (c:ConversationRecord {conversationId: m.sourceConversationId})` returning conversation metadata (FR-010)
- [ ] T028 [P] [US2] Add `viewProfile(userIdentity)` Cypher read to `src/memory/store/neo4j/memory-store.ts`: fetch `UserProfile` node + item count + 20 most recently created `MemoryItem` nodes for the user (FR-018). Use `COUNT { (m:MemoryItem)-[:OWNED_BY]->(:UserIdentity {userIdentity: $u}) }` for `itemCount` to avoid a full scan. Enforce `ORDER BY m.createdAt DESC LIMIT 20` on the `recentItems` sub-query. Both constraints required to satisfy SC-006 (≤5 s for 10 000-item stores)
- [ ] T029 [US2] Create `src/memory/control/profile.ts` with `upsertProfile(userIdentity, patch)` that writes the structured `UserProfile` to Neo4j AND calls the VoltAgent Working Memory API for automatic system-prompt injection (research.md §11 Working Memory dual-write; eliminates need to include profile in the `systemPromptAdditions` block). ⚠️ **Before implementing**: verify the exact write API against `@voltagent/core` ^2.0.0 exports — the method may be `memory.set(userId, key, value)` or exposed via agent constructor options rather than `agent.memory.updateWorkingMemory()`; inspect `packages/core/src/memory/` in the VoltAgent repo to confirm the exact signature
- [ ] T030 [P] [US2] Create `src/memory/tools/memory-view-profile.tool.ts` implementing `memoryViewProfileTool` via `createTool` per `contracts/memory-tools.contract.md` §memoryViewProfile; calls `memoryStore.viewProfile(operationContext.userId)`
- [ ] T031 [P] [US2] Create `src/memory/tools/memory-changes.tool.ts` implementing `memoryChangesTool` via `createTool` per `contracts/memory-tools.contract.md` §memoryChanges; calls `memoryStore.listConsolidationReports(operationContext.userId, limit)` (FR-016 pull-on-request surface)
- [ ] T032 [US2] Register `memorySearchTool`, `memoryViewProfileTool`, and `memoryChangesTool` in `createMemorySubsystem` in `src/memory/index.ts` and pass them to the inner `Agent` constructor via its `tools` array

---

## Phase 5: User Story 3 — Memory Stays Healthy Automatically (P3)

**Goal**: Periodic consolidation (merge duplicates, prune stale, flag contradictions), user control (forget/export/erase), supersession marking, proactive contradiction surface, and cross-channel identity pairing.

**Independent Test**: Run quickstart.md §5 (consolidation: 50+ items, verify merge/prune/contradiction counts per SC-005), §6 (forget: item removed + confirmed), §7 (export: full Markdown returned), §8 (erase: all memory wiped + confirmed), §10 (cross-channel pairing: code issued on Telegram, redeemed on dry-run, shared memory visible).

### Phase 5A: Consolidation

- [ ] T033 [US3] Create `src/memory/store/neo4j/consolidator.ts` implementing the full `Consolidator` interface (`runOnce`, `runForAllUsers`, `startScheduled`, `stopScheduled`): `runOnce(userIdentity)` executes the 5-pass Cypher pipeline — (1) seed FTS over recent items, (2) 2-hop BFS cluster expansion, (3) centrality hub scoring (degree-weighted, skip prune), (4) temporal stale-prune (`lastAccessedAt < now − 90d`, skip decisions per FR-015), (5) LLM-driven pairwise contradiction scan over same-subject clusters — then writes a `ConsolidationReport` node and returns it; `runForAllUsers()` fetches all distinct `userIdentity` values via `MATCH (u:UserIdentity) RETURN u.userIdentity` and iterates `runOnce` for each, catching per-user errors so the loop continues for remaining users (research.md §5, contracts/memory-service.contract.md)
- [ ] T034 [US3] Create `src/memory/scheduler.ts` exporting `startConsolidationScheduler(consolidator, log, intervalMs)` with a 5-min initial `setTimeout` then `setInterval`; calls `consolidator.runForAllUsers()` on each tick — this method is now defined in the `Consolidator` interface (plan.md §2.8 snippet)
- [ ] T035 [P] [US3] Create `src/memory/tools/memory-consolidate.tool.ts` implementing `memoryConsolidateTool` via `createTool` per `contracts/memory-tools.contract.md` §memoryConsolidate; calls `consolidator.runOnce(operationContext.userId)` and returns the summary fields

### Phase 5B: User Control (forget / export / erase)

- [ ] T036 [P] [US3] Create `src/memory/control/forget.ts` with `findCandidates(userIdentity, topic)` and `confirmForget(userIdentity, itemId)` logic isolating the two-call confirmation state from the tool layer (FR-017, FR-020c)
- [ ] T037 [P] [US3] Create `src/memory/control/export.ts` with `buildMarkdownExport(userIdentity, memoryStore)` that formats all MemoryItems grouped by type + all ConversationRecord summaries as a readable Markdown document (FR-019)
- [ ] T038 [P] [US3] Create `src/memory/control/erase.ts` with `eraseWithConfirmation(userIdentity, confirm, phrase, memoryStore)` that validates `confirm === true && phrase === "erase my memory"` before calling `memoryStore.eraseAll` (FR-020, FR-020c)
- [ ] T039 [US3] Add `forgetItem(userIdentity, itemId)` and `eraseAll(userIdentity)` Cypher write methods to `src/memory/store/neo4j/memory-store.ts`; `forgetItem` does `MATCH (m:MemoryItem {itemId, userIdentity}) DETACH DELETE m`; `eraseAll` deletes all nodes with `OWNED_BY` edge to the UserIdentity plus the UserProfile node (FR-017, FR-020)
- [ ] T040 [US3] Add `exportAll(userIdentity)` Cypher read method to `src/memory/store/neo4j/memory-store.ts` fetching all MemoryItem nodes + ConversationRecord nodes for the user; delegates Markdown rendering to `control/export.ts`
- [ ] T041 [P] [US3] Create `src/memory/tools/memory-forget.tool.ts` implementing `memoryForgetTool` via `createTool` per `contracts/memory-tools.contract.md` §memoryForget; delegates to `control/forget.ts` for the two-call confirmation pattern
- [ ] T042 [P] [US3] Create `src/memory/tools/memory-export.tool.ts` implementing `memoryExportTool` via `createTool` per `contracts/memory-tools.contract.md` §memoryExport; calls `memoryStore.exportAll(operationContext.userId)` and returns `{ markdown }`
- [ ] T043 [P] [US3] Create `src/memory/tools/memory-erase.tool.ts` implementing `memoryEraseTool` via `createTool` per `contracts/memory-tools.contract.md` §memoryErase; delegates to `control/erase.ts` for passphrase confirmation guard

### Phase 5C: Supersession & Contradiction Surfacing

- [ ] T044 [P] [US3] Add supersession detection to `src/memory/store/neo4j/memory-store.ts` `addMemoryItem`: before persisting a new item, find near-duplicate candidates using the existing `memoryItemDesc` full-text index \u2014 `CALL db.index.fulltext.queryNodes('memoryItemDesc', $desc) YIELD node, score WHERE node.userIdentity = $u AND node.type = $type AND node.validUntil IS NULL AND score > 1.5` (B2 fix: `~=` is not valid Cypher \u2014 use FTS instead); for each candidate, set `validUntil = datetime()` (historical marker, not delete per FR-014) and create a `SUPERSEDES` edge from the new item to the superseded one
- [ ] T045 [US3] Add contradiction surface to `src/memory/agent-facade.ts`: at the start of `generateText`, call `memoryStore.listConsolidationReports(userIdentity, 1)` and check `contradictionsDetected` for unresolved entries; if any exist, prepend a short proactive notice to `systemPromptAdditions` asking the user which version is correct (FR-016a — only surfaced once per conversation start, not on every turn)

### Phase 5D: Cross-Channel Identity Pairing

- [ ] T046 [US3] Add `issuePairingCode(userIdentity, issuingChannel)` and `consumePairingCode(newChannel, newChannelUserId, code)` to `src/memory/store/neo4j/identity-store.ts`: issue creates a `:PairingCode` node with a 6-char base32 code, 10-min `expiresAt`, `consumedAt: null`; consume validates not-expired / not-consumed / not-same-channel (rejects silently without revealing identity existence per FR-028b), then creates a new `ChannelIdentityMapping` linked to the original `userIdentity` (FR-028a, FR-028b)
- [ ] T047 [P] [US3] Create `src/memory/control/link.ts` with `startLink(userIdentity, channel, identityStore)` and `confirmLink(channel, channelNativeId, code, identityStore)` orchestrating the pairing flow
- [ ] T048 [P] [US3] Create `src/memory/tools/memory-pair-start.tool.ts` implementing `memoryPairStartTool` via `createTool` per `contracts/memory-tools.contract.md` §memoryPairStart; calls `identityStore.issuePairingCode` and returns the code + instructions
- [ ] T049 [P] [US3] Create `src/memory/tools/memory-pair-confirm.tool.ts` implementing `memoryPairConfirmTool` via `createTool` per `contracts/memory-tools.contract.md` §memoryPairConfirm; calls `identityStore.consumePairingCode`; on failure returns generic rejection (no identity leakage per FR-028b)

### Phase 5E: Slash Command Mapping

- [ ] T050 [US3] Edit `src/channels/telegram.ts` to register `/memory`, `/forget`, `/export`, and `/erase` bot commands mapping each to a system-directive message injected into `memoryAwareAgent.generateText` (e.g., `"(system directive) the user invoked /memory — call memoryViewProfile and return its result in plain prose"`) per `contracts/channel-integration.contract.md` §4

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Structured observability, graceful shutdown, optional vector index, full tool registration, and build gate.

- [ ] T051 [P] Add structured `pino` log entries at key boundaries in `src/memory/extract/extractor.ts`, `src/memory/retrieve/retriever.ts`, `src/memory/store/neo4j/identity-store.ts`, and `src/memory/store/neo4j/consolidator.ts`: log `{ userIdentity, conversationId, counts, durationMs }` for every ingest / retrieve / consolidate pass — use `conversationId` (already threaded through all call paths) as the correlation key; never log `channelNativeId` (privacy boundary per `channel-integration.contract.md` §Identity Privacy)
- [ ] T052 [P] Add `driver.close()` call to the VoltAgent process shutdown hook in `src/index.ts` (on `SIGINT`/`SIGTERM`) so bolt connections drain cleanly (research.md §9 driver lifecycle)
- [ ] T053 [P] Add optional vector index branch to `src/memory/store/neo4j/migrate.ts`: when `config.memoryEmbeddings === "provider"`, run `CREATE VECTOR INDEX memoryItemEmbedding IF NOT EXISTS FOR (m:MemoryItem) ON m.embedding OPTIONS {indexConfig: {dimensions: 1536, similarityFunction: 'cosine'}}` per data-model.md §3 optional vector block
- [ ] T054 Register all remaining memory tools (`memoryForgetTool`, `memoryExportTool`, `memoryEraseTool`, `memoryPairStartTool`, `memoryPairConfirmTool`, `memoryConsolidateTool`) in `createMemorySubsystem` in `src/memory/index.ts` and start the consolidation scheduler via `startConsolidationScheduler` in the same factory
- [ ] T055 Run `npm run typecheck && npm run lint && npm run build` and resolve any type errors or lint violations; confirm all three commands exit with code 0

---

## Dependencies

| Story         | Depends on                                                  | Can parallelize with |
| ------------- | ----------------------------------------------------------- | -------------------- |
| US1 (Phase 3) | Phase 2 complete                                            | —                    |
| US2 (Phase 4) | Phase 3 retriever (T019) and memory-store (T018) exist      | US3 (Phase 5)        |
| US3 (Phase 5) | Phase 3 identity-store (T013) and memory-store (T018) exist | US2 (Phase 4)        |
| Phase 6       | All story phases complete                                   | —                    |

---

## Summary

| Metric                     | Value                                        |
| -------------------------- | -------------------------------------------- |
| **Total tasks**            | 55                                           |
| **Phase 1 (Setup)**        | 2 tasks                                      |
| **Phase 2 (Foundational)** | 10 tasks                                     |
| **Phase 3 (US1 — MVP)**    | 13 tasks                                     |
| **Phase 4 (US2)**          | 7 tasks                                      |
| **Phase 5 (US3)**          | 18 tasks (5A: 3, 5B: 8, 5C: 2, 5D: 4, 5E: 1) |
| **Phase 6 (Polish)**       | 5 tasks                                      |
| **Parallelizable tasks**   | 28 tasks marked [P]                          |
| **US1 story tasks**        | 13                                           |
| **US2 story tasks**        | 7                                            |
| **US3 story tasks**        | 18                                           |

**MVP scope**: Phases 1–3 (25 tasks) deliver a working cross-session memory system with per-user isolation on Telegram and the dry-run channel — all US1 acceptance scenarios satisfied.

**Format validation**: All 55 tasks follow the checklist format — checkbox ✓, sequential Task ID ✓, [P] label where applicable ✓, [US] story label for story-phase tasks ✓, file path in every description ✓.
