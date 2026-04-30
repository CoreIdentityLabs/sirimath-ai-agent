# Phase 0 Research: Self-Improving Memory for Sirimath

**Feature**: `specs/004-self-improving-memory/spec.md`
**Date**: 2026-04-20
**Status**: Complete — all unknowns resolved
**Revision**: 2 (2026-04-20) — Neo4j path per user direction, dropped MCP intermediary.

This document records the decisions that resolve every *NEEDS CLARIFICATION* raised while filling in the Technical Context of [plan.md](./plan.md). Each decision is keyed to one or more functional requirements in the spec.

---

## 1. Storage backend

**Decision**: Use **Neo4j 5.x Community Edition** (self-hostable and free) as the persistence layer for the self-improving memory subsystem, accessed via the official `neo4j-driver` npm package over the bolt protocol. VoltAgent's existing `@voltagent/libsql` store continues to handle short-term conversation history (unchanged) and observability traces (unchanged). The new Neo4j instance is the home of the long-term memory graph only.

**Rationale**:
- The spec's data model is a graph: FR-004 elevates *relationships* to first-class entities; FR-008 explicitly requires retrieval by "graph relationships"; FR-011 requires synthesis across many items via traversal; FR-013 contradiction detection is a pattern-matching problem.
- Neo4j is the reference graph DB: Cypher is expression-level graph-native, it ships native full-text indexes (Lucene), and since 5.11 it has a first-class vector index that satisfies FR-008's semantic dimension without any bolt-on.
- The three referenced research documents (Karpathy LLM Wiki, `open-graph-memory-mcp`, Hermes) all converge on a graph as the natural representation for compounding memory. `open-graph-memory-mcp` in particular is explicitly designed with Neo4j as an optional backend — we are adopting the same node/relationship schema it uses and rebuilding it as a first-party component rather than consuming the MCP.
- Neo4j Community Edition is **Apache 2.0-licensed and free to run**. Preserves FR-024's "no additional paid external service" bar. AuraDB Free tier exists for operators who prefer managed hosting — also free.

**Constitutional trade-off**: the constitution pins persistence to `@voltagent/libsql` (Technology Stack clause) and forbids other databases "without explicit justification". Neo4j is the deliberate exception — it is justified in a filled `Complexity Tracking` row in [plan.md](./plan.md) (Principle V + Technology Stack gate). The short-term conversation store and observability store remain on `@voltagent/libsql`.

**Alternatives considered**:
- *Stay on LibSQL with an adjacency table* (rejected) — the previous revision of this plan used this approach. k-hop traversal on SQLite requires recursive CTEs that are slow beyond ~1 k nodes and cannot express the deep-analyze 5-pass that the spec's referenced research describes. SC-006 targets 10 k items; SQLite would hit the wall well before that.
- *Use the `open-graph-memory-mcp` server via MCP* (rejected — user directive, Path C) — adds a second runtime process and a client-protocol dependency; extensions (pairing-code identity, credential redaction, per-user isolation) aren't MCP-native and would need to be layered above the MCP surface anyway.
- *Managed cloud graph DBs (Amazon Neptune, TigerGraph Cloud)* — rejected: paid services, break FR-024.
- *Key-value stores + external graph engine (e.g., DuckDB with graph extensions)* — rejected: immature ecosystem, adds dev-time complexity with no Cypher-equivalent DSL.

---

## 2. Neo4j deployment model

**Decision**: Neo4j runs as an **out-of-process service** alongside Sirimath. It is never bundled into the Sirimath Docker image. Operators provision Neo4j themselves:

- **Development**: `docker run -d --name sirimath-neo4j -p 7687:7687 -p 7474:7474 -e NEO4J_AUTH=neo4j/test -v sirimath-neo4j-data:/data neo4j:5-community`
- **Production (self-hosted)**: a dedicated Neo4j container/VM managed by the operator (same image, with TLS, authentication hardening, and backups per operator policy).
- **Production (managed)**: Neo4j AuraDB (Free tier or higher). Same bolt connection, no code change.

Sirimath discovers Neo4j through three env vars — `NEO4J_URI` (bolt/neo4j scheme), `NEO4J_USER`, `NEO4J_PASSWORD`. If *any* of the three is missing at startup, the memory subsystem initializes in **degraded mode**: the agent starts normally, all nine memory tools return a clear "memory disabled" message, and every user turn is answered without retrieval — matching FR-022's "system must still respond" contract. This is the canonical graceful-degradation path.

**Rationale**:
- Constitution mandates `Dockerfile MUST remain the single production packaging artefact; no docker-compose in production deployments`. Running Neo4j out-of-process honours this: the Sirimath Dockerfile stays single-artefact; Neo4j is the operator's concern. Dev may use a `docker-compose.dev.yml` (allowed — constitution constrains *production* only).
- Graceful degradation preserves FR-022 and matches the existing project pattern (voice is disabled gracefully when `VOICE_PROVIDER` is unset; `[src/config/voice-provider.ts:13-16]`).

**Alternatives considered**:
- *Embed an in-process graph DB (e.g., `graphology`, `@gitlab/cgx`)* — rejected: loses persistence on restart, violates FR-021.
- *Run Neo4j inside the Sirimath Docker image via supervisord* — rejected: violates the single-artefact principle, sextuples image size to ~700 MB, and ties Neo4j lifecycle to Sirimath lifecycle.

---

## 3. Retrieval algorithm

**Decision**: Hybrid retrieval using three Neo4j primitives composed in Cypher:
1. **Full-text index match** on `MemoryItem.description` via `CALL db.index.fulltext.queryNodes('memoryItemDesc', $q)` — BM25-ranked keyword hits, scoped to `OWNED_BY` the current `user_identity`.
2. **k-hop graph expansion** from the top-N keyword hits: `MATCH (anchor)-[r*1..2]-(related:MemoryItem) WHERE related.userIdentity = $u` — pulls in items the user didn't keyword-match but are one-or-two hops away through typed relationships (FR-008).
3. **LLM re-rank** of the combined candidate set (up to ~24 items) via `generateObject` with a Zod schema returning `{ itemIds: string[], reason: string }` — produces the final top-K in semantic-relevance order.

Total latency budget breakdown (on the SC-004 1-second path):
- Neo4j full-text query (indexed): ≤ 20 ms
- 1-2 hop Cypher expansion: ≤ 50 ms
- LLM re-rank (short prompt, 1 completion): ~500-800 ms
- JSON parsing + Zod validation: negligible
- **Total**: ≤ ~900 ms — fits within the 1 s budget.

**Optional upgrade** — Neo4j 5.11+ native **vector index**. When the operator sets `MEMORY_EMBEDDINGS=provider` and the configured LLM provider exposes an embeddings endpoint (OpenAI `text-embedding-3-small`, Azure embedding deployment, etc.), the ingest pipeline writes a 1 536-dim vector into `MemoryItem.embedding`, and retrieve adds a `CALL db.index.vector.queryNodes(...)` call to the hybrid mix. Still opt-in (FR-024 zero-cost default preserved).

**Rationale**:
- All three signals (FTS, graph, semantic) are first-class Neo4j primitives — no extension packages needed.
- The LLM re-rank stays the default even without embeddings, giving strong "semantic" selection without paying for an embedding API call every turn.
- The deep-analyze five-pass pattern described in `open-graph-memory-mcp`'s research doc (seed search → BFS → centrality → temporal → contradiction) becomes five Cypher queries the `memoryConsolidate` tool can run in sequence — covered in §5.

**Alternatives considered**:
- *Neo4j native vector index as the primary signal* — rejected for default: requires an embeddings API call per ingest and per query, violating FR-024. Kept as opt-in.
- *Pure Cypher traversal without LLM re-rank* — rejected: fails SC-001 (90 %) on longer-tail queries where the user's wording is semantically adjacent but lexically divergent from stored descriptions.
- *External vector DB (Qdrant, Chroma)* — rejected: yet another service, Complexity Tracking would balloon.

---

## 4. Memory extraction (ingest) strategy

**Decision**: Unchanged from the LibSQL revision. After every user+assistant turn, invoke the already-configured `LanguageModel` once via Vercel AI SDK `generateObject` with a Zod schema (`ExtractionResultSchema` in [data-model.md](./data-model.md)) to produce a structured list of `MemoryItem` candidates and `Relationship` candidates. Persist the result via Cypher `MERGE` patterns so re-extracted duplicates within a short window don't create new nodes. The call is fire-and-forget — never awaited on the response path (preserves SC-004).

**Rationale**:
- The extractor is DB-agnostic; the extraction strategy from the previous revision still applies.
- Cypher `MERGE (m:MemoryItem {userIdentity:$u, description:$d}) ON CREATE SET m.itemId = $id, m.type = $t ...` is natively idempotent and eliminates duplicate-on-retry concerns.
- The extractor prompt includes the instruction "refuse to emit items that look like secrets" — defence-in-depth alongside the regex redaction (see §6).

**Alternatives considered**: identical to revision 1 — rule-based extraction (rejected), separate cheap model (rejected for BYOK compliance), batched async queue (rejected for freshness).

---

## 5. Consolidation (lint) strategy

**Decision**: Daily scheduled consolidation + on-demand `memoryConsolidate` tool. The pass runs the **deep-analyze 5-pass pattern** borrowed from `open-graph-memory-mcp`, expressed as five Cypher queries:

1. **Seed**: full-text query over recent items to surface candidate focus topics (`CALL db.index.fulltext.queryNodes('memoryItemDesc', $recentTopics)`).
2. **BFS expansion**: 2-hop traversal from each seed to build an activation neighbourhood (`MATCH (seed)-[*1..2]-(n:MemoryItem) WHERE n.userIdentity = $u`).
3. **Centrality**: identify "hub" items (degree-weighted, in the activation set) whose removal would disconnect clusters — these are candidates for promotion in retrieval weighting, never for pruning.
4. **Temporal audit**: find `MemoryItem` nodes where `validUntil IS NULL AND lastAccessedAt < (now - 90d) AND NOT (type = 'decision')` — the stale-pruning set (FR-015).
5. **Contradiction scan**: LLM-driven pairwise judgment over same-subject item clusters (obtained via Cypher pattern matching on shared relationships) — outputs a list of `(itemA, itemB, reason)` triples that get written to the `ConsolidationReport.contradictionsDetected` array. These are the only items surfaced proactively to the user (FR-016a).

Pruning of stale items and merging of duplicates happens *after* the five passes, in a single write transaction per user. Duplicate detection uses LLM judgement over FTS-derived candidate pairs (same approach as revision 1; cheaper than vector-similarity for the default path).

**Rationale**:
- Five passes give richer consolidation than a single sweep without significantly more runtime (≤ 10 seconds for 10 k items at SC-005 scale).
- All five passes are Cypher + optional LLM calls — no new library.
- The centrality pass gives the memory subsystem a genuine "compounding" property: frequently linked items are more retrievable over time (P2 synthesis quality gradually improves).

**Alternatives considered**:
- *Single-pass consolidation* — rejected: loses the centrality and temporal audit signals.
- *VoltAgent `createWorkflowChain` for consolidation* — rejected: consolidation has no human-in-the-loop suspend/resume; `setInterval` + on-demand tool is sufficient (Principle V YAGNI).

---

## 6. Sensitive-content (credential) detection

**Decision**: Unchanged from revision 1. Deterministic regex redaction runs pre-ingest; matched spans are replaced with `[REDACTED:<kind>]`; items that collapse to pure redaction are skipped and a user-visible notice is emitted (FR-006). The extractor LLM is instructed to refuse to emit secret-shaped items as a secondary check.

**Rationale**: DB-agnostic; applies equally to Neo4j.

---

## 7. Identity resolution & cross-channel linking

**Decision**: Unchanged from revision 1. ULID-shaped internal `user_identity`; `ChannelIdentityMapping` node for each `(channel, channelUserId)` pair; 6-character base32 single-use 10-minute pairing code; rejected on same-channel redemption; never leaks identity existence on failure. The only change is implementation: these are now Neo4j nodes and relationships rather than SQLite tables (see [data-model.md](./data-model.md) §3).

**Rationale**: Neo4j doesn't change the identity model — the abstract rules (FR-025–029) are unaltered. Cypher `MERGE` on the `(channel, channelUserId)` composite key, guarded by a Neo4j uniqueness constraint, gives us the "resolveOrCreate" primitive atomically.

---

## 8. Integration surface with the existing agent

**Decision**: Unchanged from revision 1. Thin `MemoryAwareAgent` façade in `src/memory/agent-facade.ts` wraps the VoltAgent `Agent`. Channel adapters call `facade.reply({ userIdentity, conversationId, channel, channelNativeId, text })`. The façade does *not* know about Neo4j — it calls the abstract `IdentityStore` / `MemoryStore` / `Consolidator` interfaces from [contracts/memory-service.contract.md](./contracts/memory-service.contract.md).

**Rationale**: The façade was deliberately designed DB-agnostic in revision 1; swapping LibSQL for Neo4j only touches `src/memory/store/*`. The contracts and tool schemas are unchanged — proving the layering was sound.

---

## 9. Driver lifecycle and connection pooling

**Decision**: Create a single `neo4j-driver` instance at bootstrap via a factory in `src/memory/store/driver.ts`, call `await driver.verifyConnectivity()` once during initialization, and reuse it for the whole process lifetime. The driver's built-in connection pool (default: 100 concurrent bolt connections) is more than sufficient for single-user scale. Each `Session` is short-lived — opened per store-method invocation, closed in `finally`. Write transactions use `session.executeWrite(tx => ...)`; reads use `session.executeRead`.

**Rationale**:
- `neo4j-driver` recommends exactly this pattern.
- `verifyConnectivity` at startup gives us a clean "memory enabled / disabled" signal that drives graceful degradation (see §2).
- Sessions are cheap — no global state, no leaks if we're disciplined with `finally { await session.close(); }`.

**Alternatives considered**:
- *Per-request driver creation* — rejected: ignores the pool, terrible for throughput.
- *Connection-per-user isolation* — rejected: no need at our scale; per-user isolation is enforced by `userIdentity` predicates in every query, not by connection segregation.

---

## 10. Testing strategy

**Decision**: Unchanged from revision 1 — typecheck + lint + [quickstart.md](./quickstart.md) manual verification. Add one Neo4j-specific gate: `await driver.verifyConnectivity()` at boot logs either `[memory] connected to neo4j at <uri>` or `[memory] disabled — NEO4J_URI not set or unreachable`.

Quickstart §1 (schema materialization) now verifies via `cypher-shell` commands or Neo4j Browser (http://localhost:7474) instead of `sqlite3`.

---

## 11. Summary of key decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | Storage | **Neo4j 5.x Community** via `neo4j-driver`; LibSQL retained for short-term history + observability |
| 2 | Deployment | Out-of-process; `NEO4J_URI`/`USER`/`PASSWORD` env vars; missing → graceful-degraded memory-disabled mode |
| 3 | Retrieval | FTS + k-hop Cypher traversal + LLM re-rank; optional native vector index behind `MEMORY_EMBEDDINGS=provider` |
| 4 | Extraction | Per-turn fire-and-forget, `generateObject` w/ Zod, MERGE-based persist (idempotent) |
| 5 | Consolidation | Daily `setInterval` + on-demand; 5-pass Cypher (seed/BFS/centrality/temporal/contradiction) |
| 6 | Sensitive content | Regex redaction + extractor-LLM refusal |
| 7 | Identity | ULID; `ChannelIdentityMapping` nodes; 6-char pairing code, 10-min TTL, single-use, same-channel-rejected |
| 8 | Integration surface | `MemoryAwareAgent` façade (DB-agnostic, unchanged) |
| 9 | Driver lifecycle | Single driver, verifyConnectivity at boot, short-lived sessions |
| 10 | Testing | Typecheck + lint + quickstart manual script |

All decisions preserve FR-024's zero-extra-cost default (Neo4j Community is free), FR-009 per-user isolation, and the channel-agnostic hard requirement (FR-025–029). The single constitutional deviation — adding Neo4j outside the allowed Technology Stack — is justified in [plan.md](./plan.md) Complexity Tracking.
