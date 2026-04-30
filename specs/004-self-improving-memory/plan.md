# Implementation Plan: Self-Improving Memory for Sirimath

**Branch**: `memory-management` (spec dir: `004-self-improving-memory`) | **Date**: 2026-04-20 | **Spec**: [spec.md](./spec.md)
**Revision**: 2 — Neo4j backend (replaces the LibSQL draft). See Complexity Tracking for the deviation justification.
**Input**: Feature specification from [spec.md](./spec.md)

## Summary

Add a self-improving, channel-agnostic, per-user-isolated memory subsystem to Sirimath so the agent remembers facts, preferences, decisions, and relationships **across sessions and across channels** while keeping users in full control of what is stored.

Storage is **Neo4j 5.x** (Community Edition, Apache 2.0). The graph is the first-class data model — memory items are nodes, relationships are typed edges, and synthesis is a k-hop traversal instead of a SQL join. Design ideas (schema shape, traversal patterns, consolidation loops) are borrowed from [open-graph-memory-mcp](../../src/docs/https-github-com-coreidentitylabs-open-graph-memor.md), adapted into a direct `neo4j-driver` integration — no MCP layer — so retrieval latency stays within SC-004 (≤1 s overhead) and the deployment footprint stays in process.

Architecture:

- A VoltAgent **Agent façade** (`MemoryAwareAgent`) wraps the existing `Agent` and injects retrieved memories into the system prompt before each turn, then fire-and-forget extracts new memories from the exchange.
- A **channel-agnostic identity layer** maps each `(channel, channelUserId)` to a ULID `userIdentity`; any future channel adapter (Slack, WhatsApp, CLI, web) reuses the same identity and memory store with zero changes inside `src/memory/`.
- A **consolidator** runs nightly (and on-demand via tool) to merge duplicates, prune stale items, record supersessions, and flag contradictions.
- A **control surface** exposes profile/forget/export/erase via both natural language (LLM tool calls) and slash commands (FR-017–020).

Storage is gated behind a thin `MemoryStore` port — the façade stays DB-agnostic, so replacing Neo4j with another graph (or returning to LibSQL) later is a single adapter swap.

## Technical Context

| Field                               | Value                                                                                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Language / runtime**              | TypeScript strict mode, Node 22 LTS, ES2022 target, bundler module resolution                                                                                                                                                                                                    |
| **Primary dependencies (existing)** | `@voltagent/core` ^2.0.0, `@voltagent/libsql` ^2.0.0 (short-term conversation memory only — retained), `ai` ^6.0.x, `zod` ^3.25, `grammy` ^1.41.1, `pino` ^9.x, `ulid` (new)                                                                                                     |
| **New dependencies**                | `neo4j-driver` ^5.26.0 (official, Apache 2.0), `ulid` ^2.3.0                                                                                                                                                                                                                     |
| **Storage**                         | **Neo4j 5.x Community Edition** (graph: nodes + typed edges + full-text index + optional native vector index ≥5.11). LibSQL retained _only_ for VoltAgent's short-term chat history (`.voltagent/memory.db`).                                                                    |
| **Testing**                         | Manual verification per [quickstart.md](./quickstart.md). Gate commands: `npm run typecheck`, `npm run lint`, `npm run build`. No automated test suite exists (see [CLAUDE.md](../../.claude/CLAUDE.md) Commands section).                                                       |
| **Target platform**                 | Linux container (prod) and Windows/macOS dev hosts. Neo4j is out-of-process (operator-provisioned) — the Sirimath container does not bundle the DB.                                                                                                                              |
| **Project type**                    | Single Node service (VoltAgent agent + grammy channel adapter). No split between frontend and backend.                                                                                                                                                                           |
| **Performance goals**               | SC-004: retrieve() + extract() adds ≤ 1 s average to turn latency over 20 samples. SC-001: cross-session recall ≥ 90%. SC-003: zero cross-user leakage. SC-005: consolidation merges ≥ 95% of duplicates, prunes ≥ 90% of stale items with zero `decision`-type false positives. |
| **Constraints**                     | FR-022 graceful degradation (unset/unreachable `NEO4J_URI` → agent boots stateless); FR-024 zero-extra-cost default (Neo4j Community is free; AuraDB Free tier is free; no mandatory paid vendor); FR-006 sensitive-content redaction pre-ingest.                                |
| **Scale**                           | Single-user personal assistant today; plan for ≤ 100 concurrent users and ≤ 100k memory items per user before we need to revisit indexing strategy.                                                                                                                              |
| **New env vars**                    | `NEO4J_URI` (default `bolt://localhost:7687`), `NEO4J_USER` (default `neo4j`), `NEO4J_PASSWORD` (required), `MEMORY_EMBEDDINGS` (optional: `provider` to enable vector re-rank), `MEMORY_CONSOLIDATION_CRON` (optional: default daily at 03:00 local).                           |

## Constitution Check

Evaluated against [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.1.0.

| #   | Principle                     | Status | Notes                                                                                                                                                                                                                                        |
| --- | ----------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I   | Channel-Agnostic Core         | ✅     | Memory subsystem sits under `src/memory/` with zero `grammy`/Telegram imports. The Telegram adapter passes `(channel, channelUserId)` → the identity layer returns a ULID; any new adapter does the same.                                    |
| II  | User Isolation by Default     | ✅     | Every memory read/write and every Cypher query is scoped by `userIdentity`. `UserIdentity` is a Neo4j node with a uniqueness constraint; leak-tests are part of quickstart §3.                                                               |
| III | Explicit Consent & Control    | ✅     | `/memory`, `/forget`, `/export`, `/erase` commands + NL tool equivalents + confirmation prompt before destructive actions (FR-020c).                                                                                                         |
| IV  | Graceful Degradation          | ✅     | Missing or unreachable `NEO4J_URI` → `MemoryStore` resolves to a no-op stub; agent replies normally with a one-line warning appended (FR-022). Verified in quickstart §9.                                                                    |
| V   | Observability Over Cleverness | ✅     | Structured `pino` logs for every ingest/retrieve/consolidate pass: `userIdentity`, `traceId`, counts, latency. No silent fallbacks.                                                                                                          |
| VI  | Boring > Novel                | ⚠      | Neo4j is a new runtime dependency for the project (novelty cost). Mitigation: it is itself a boring, mature (2007-vintage) database with an official TypeScript driver and Apache 2.0 license. No framework/DSL invention — straight Cypher. |
| VII | Reversible Changes            | ✅     | Cypher migrations are idempotent (`IF NOT EXISTS`); file-level diff is additive (new `src/memory/` tree + one line in `src/channels/telegram.ts`). Rollback = delete the `src/memory/` directory and unset `NEO4J_URI`.                      |

**Technology Stack clause** (constitution §Technology Stack): current clause pins persistence to `@voltagent/libsql`. Neo4j is a deviation.

| Clause                                      | Status | Justification                      |
| ------------------------------------------- | ------ | ---------------------------------- |
| Persistence: `@voltagent/libsql` as default | ❌     | See **Complexity Tracking** below. |

**Gate decision**: PASS with one justified deviation. Proceed to Phase 0.

## Complexity Tracking

| Deviation                                                               | Why we need it                                                                                                                                                                                                                                                                                                                                                                  | Why the default is insufficient                                                                                                                                                                                                                                                                                       | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swap LibSQL for **Neo4j 5 Community** as the memory subsystem's storage | The memory model is a **graph** — memory items link to other items via typed semantic edges (`USES`, `DEPENDS_ON`, `DECIDED_TO`, `SUPERSEDES`, `PART_OF`, `CONTRADICTS`, `CLARIFIES`). Synthesis queries (SC-002 / User Story 2) traverse k hops across those edges. Consolidation (SC-005 / User Story 3) detects clusters, chains, and contradictions — all graph operations. | A SQL / LibSQL implementation would force us to either (a) reinvent graph traversal in application code (slow, buggy, poor fit for k-hop queries that Cypher expresses in one line) or (b) store edges as rows and do recursive CTEs on every synthesis turn (exceeds SC-004's 1 s latency budget on realistic data). | Neo4j Community is **Apache 2.0 and free forever** (preserves FR-024 zero-extra-cost). AuraDB Free tier is also free (managed option). Storage stays **behind a `MemoryStore` port** so swapping back is a single-adapter exercise. Dev uses `docker-compose.dev.yml` only — prod expects an operator-provisioned Neo4j (consistent with the constitution's "no docker-compose in production" clause). Graceful degradation preserved via FR-022. |

The deviation is scoped to the memory subsystem. VoltAgent's built-in short-term conversation history continues to use `@voltagent/libsql` (unchanged). No other area of the codebase is touched.

## Project Structure

### Documentation (this feature)

```
specs/004-self-improving-memory/
├── plan.md               # this file (revision 2 — Neo4j)
├── research.md           # Phase 0 output (revision 2 — Neo4j)
├── data-model.md         # Phase 1 output (revision 2 — Neo4j Cypher schema + Zod domain types)
├── quickstart.md         # Phase 1 output (revision 2 — manual verification script)
├── contracts/
│   ├── memory-service.contract.md     # unchanged (DB-agnostic ports)
│   ├── memory-tools.contract.md        # unchanged (9 agent tools)
│   └── channel-integration.contract.md # unchanged (adapter contract)
└── checklists/
    └── requirements.md   # from /speckit.specify — spec quality gate
```

### Source Code (new tree + minimal existing-file edits)

```
src/
├── index.ts                             # EDIT: wire MemoryAwareAgent if NEO4J_URI set
├── channels/
│   └── telegram.ts                      # EDIT: 1 line — pass channel metadata to agent.generateText
├── memory/
│   ├── index.ts                         # public barrel (MemoryAwareAgent, createMemorySubsystem)
│   ├── types.ts                         # Zod schemas + TS types (re-exported from data-model.md)
│   ├── agent-facade.ts                  # MemoryAwareAgent — wraps VoltAgent Agent, DB-agnostic
│   ├── config.ts                        # env var loading (NEO4J_*, MEMORY_*)
│   ├── ports/
│   │   ├── identity-store.ts            # IdentityStore interface
│   │   ├── memory-store.ts              # MemoryStore interface
│   │   └── consolidator.ts              # Consolidator interface
│   ├── store/
│   │   ├── neo4j/
│   │   │   ├── driver.ts                # neo4j-driver factory + verifyConnectivity + lifecycle
│   │   │   ├── migrations.cypher        # constraints + indexes (idempotent)
│   │   │   ├── migrate.ts               # applies migrations.cypher on boot
│   │   │   ├── identity-store.ts        # Cypher MERGE for UserIdentity + ChannelIdentityMapping
│   │   │   ├── memory-store.ts          # ingest + retrieve + forget + export + erase (Cypher)
│   │   │   └── consolidator.ts          # 5-pass consolidation in Cypher
│   │   └── noop/
│   │       └── stub.ts                  # degraded-mode implementation (FR-022)
│   ├── extract/
│   │   ├── prompt.ts                    # system prompt for extraction LLM
│   │   ├── schema.ts                    # Zod schema for generateObject output
│   │   ├── redact.ts                    # regex-based PII redaction (FR-006)
│   │   └── extractor.ts                 # generateObject wrapper + rate-limit/backoff
│   ├── retrieve/
│   │   ├── query-parser.ts              # extract entities/intents from user turn
│   │   └── retriever.ts                 # FTS + k-hop + optional vector re-rank
│   ├── control/
│   │   ├── profile.ts                   # /memory view
│   │   ├── forget.ts                    # /forget
│   │   ├── export.ts                    # /export
│   │   ├── erase.ts                     # /erase
│   │   └── link.ts                      # /memory link (pairing code)
│   ├── tools/                           # 9 createTool definitions for the agent
│   │   ├── memory-recall.tool.ts
│   │   ├── memory-add.tool.ts
│   │   ├── memory-forget.tool.ts
│   │   ├── memory-profile.tool.ts
│   │   ├── memory-export.tool.ts
│   │   ├── memory-erase.tool.ts
│   │   ├── memory-link-start.tool.ts
│   │   ├── memory-link-confirm.tool.ts
│   │   └── memory-consolidate.tool.ts
│   └── scheduler.ts                     # setInterval-based nightly consolidation driver
└── channels/
    └── dryrun.ts                        # NEW: stdin/stdout channel adapter (proves SC-009)
```

No new top-level directories outside `src/memory/` and one new file under `src/channels/`.

## Phase 0 — Research (completed)

See [research.md](./research.md) (revision 2). 11 decisions logged:

1. **Storage → Neo4j 5 Community** (Apache 2.0; graph-native; free).
2. **Driver → `neo4j-driver` ^5.26** (official, TypeScript, session-based).
3. **Deployment → out-of-process** (operator-provisioned in prod; docker-compose.dev.yml in dev).
4. **Retrieval → full-text index + k-hop traversal + optional LLM re-rank** (optional vector re-rank when `MEMORY_EMBEDDINGS=provider`).
5. **Extraction → `generateObject` with Zod schema**, fire-and-forget per turn, max 1 retry.
6. **Consolidation → 5-pass Cypher** (seed → BFS-cluster → centrality prune → temporal supersession → contradiction flag).
7. **Redaction → regex pre-ingest** (emails, phone numbers, credit-card-like, known secret prefixes).
8. **Identity → ULID `userIdentity`** + `(channel, channelUserId)` composite mapping; pairing code for cross-channel merge.
9. **Façade → DB-agnostic `MemoryAwareAgent`** wrapping VoltAgent `Agent`.
10. **Driver lifecycle → single shared driver**, session-per-request, closed on shutdown.
11. **Testing → manual** per quickstart.md (no automated suite exists).

## Phase 1 — Design & Contracts (completed)

- [data-model.md](./data-model.md) — Zod schemas (DB-agnostic), Cypher constraints, indexes, full-text index, optional vector index, 7 semantic + 7 structural relationship types, persist/retrieve example snippets.
- [contracts/memory-service.contract.md](./contracts/memory-service.contract.md) — `IdentityStore`, `MemoryStore`, `Consolidator` ports (unchanged from revision 1 — they are storage-agnostic).
- [contracts/memory-tools.contract.md](./contracts/memory-tools.contract.md) — 9 agent-facing `createTool` definitions (unchanged).
- [contracts/channel-integration.contract.md](./contracts/channel-integration.contract.md) — channel adapter contract the Telegram and dry-run adapters both honour (unchanged).
- [quickstart.md](./quickstart.md) — 10-step manual verification covering SC-001, SC-002, SC-003, SC-004, SC-005, SC-009 plus the degraded-mode path (FR-022).
- Agent context file: [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) — SPECKIT markers point at this plan.

## Phase 2 — Integration Code Snippets

The snippets below are the **reference shape** for the implementation tasks that `/speckit.tasks` will emit next. They are not the full source — they show enough of the integration to make the design reviewable.

### 2.1 `src/memory/store/neo4j/driver.ts` — driver factory + connectivity check

```typescript
import neo4j, { type Driver } from "neo4j-driver";
import type { Logger } from "pino";
import type { MemoryConfig } from "../../config.js";

export async function createNeo4jDriver(
  cfg: MemoryConfig,
  log: Logger,
): Promise<Driver | null> {
  if (!cfg.neo4jUri) {
    log.info("[memory] NEO4J_URI not set — memory disabled");
    return null;
  }
  const driver = neo4j.driver(
    cfg.neo4jUri,
    neo4j.auth.basic(cfg.neo4jUser, cfg.neo4jPassword),
    { disableLosslessIntegers: true, userAgent: "sirimath-memory/1.0" },
  );
  try {
    await driver.verifyConnectivity();
    log.info({ uri: cfg.neo4jUri }, "[memory] connectivity verified");
    return driver;
  } catch (err) {
    log.warn(
      { err },
      "[memory] NEO4J_URI is set but connectivity failed — memory disabled (agent stateless for long-term recall)",
    );
    await driver.close().catch(() => {});
    return null;
  }
}
```

### 2.2 `src/memory/store/neo4j/migrate.ts` — idempotent schema bootstrap

```typescript
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Driver } from "neo4j-driver";
import type { Logger } from "pino";

const migrationsPath = fileURLToPath(
  new URL("./migrations.cypher", import.meta.url),
);

export async function applyMigrations(
  driver: Driver,
  log: Logger,
): Promise<void> {
  const ddl = await readFile(migrationsPath, "utf8");
  const statements = ddl
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("//"));

  const session = driver.session();
  try {
    for (const stmt of statements) {
      await session.executeWrite((tx) => tx.run(stmt));
    }
    log.info({ applied: statements.length }, "[memory] migrations applied");
  } finally {
    await session.close();
  }
}
```

### 2.3 `src/memory/store/neo4j/identity-store.ts` — ULID minting + channel mapping

```typescript
import { ulid } from "ulid";
import type { Driver } from "neo4j-driver";
import type { IdentityStore } from "../../ports/identity-store.js";

export function createNeo4jIdentityStore(driver: Driver): IdentityStore {
  return {
    async resolve({ channel, channelUserId }) {
      const session = driver.session();
      try {
        const res = await session.executeWrite(async (tx) => {
          const r = await tx.run(
            `
            MERGE (cim:ChannelIdentityMapping {channel: $channel, channelUserId: $channelUserId})
            ON CREATE SET
              cim.userIdentity = $newId,
              cim.createdAt = datetime()
            WITH cim
            MERGE (u:UserIdentity {userIdentity: cim.userIdentity})
              ON CREATE SET u.createdAt = datetime()
            MERGE (cim)-[:BELONGS_TO]->(u)
            RETURN u.userIdentity AS userIdentity
            `,
            { channel, channelUserId, newId: ulid() },
          );
          return r.records[0].get("userIdentity") as string;
        });
        return res;
      } finally {
        await session.close();
      }
    },
    // startLink / confirmLink — see full ports/identity-store.ts
  };
}
```

### 2.4 `src/memory/store/neo4j/memory-store.ts` — ingest (simplified)

```typescript
export async function ingest(
  driver: Driver,
  userIdentity: string,
  items: ExtractedItem[],
  rels: ExtractedRelationship[],
  conversationId: string,
): Promise<void> {
  if (items.length === 0 && rels.length === 0) return;
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        UNWIND $items AS it
        MERGE (m:MemoryItem {itemId: it.itemId})
          ON CREATE SET
            m.userIdentity       = $userIdentity,
            m.type               = it.type,
            m.description        = it.description,
            m.sourceConversationId = $conversationId,
            m.validFrom          = datetime(it.validFrom),
            m.createdAt          = datetime(),
            m.accessCount        = 0
        WITH m
        MATCH (u:UserIdentity {userIdentity: $userIdentity})
        MERGE (m)-[:OWNED_BY]->(u)
        `,
        { items, userIdentity, conversationId },
      );
      // Semantic edges — one query per edge type keeps the APOC-free path simple.
      for (const rel of rels) {
        await tx.run(
          `
          MATCH (a:MemoryItem {itemId: $fromId, userIdentity: $userIdentity})
          MATCH (b:MemoryItem {itemId: $toId,   userIdentity: $userIdentity})
          CALL apoc.create.relationship(a, $relType, {
            relationshipId: $relId,
            createdAt: datetime()
          }, b) YIELD rel
          RETURN rel
          `,
          { ...rel, userIdentity },
        );
      }
    });
  } finally {
    await session.close();
  }
}
```

> **Note on APOC**: the relationship-creation step above uses APOC's `apoc.create.relationship` because Cypher forbids parameterising relationship types. If the operator cannot install APOC, the fallback is a switch statement that dispatches to 7 hard-coded `MERGE (a)-[:USES {…}]->(b)` queries. The tasks breakdown will include the APOC-free variant explicitly.

### 2.5 `src/memory/store/neo4j/memory-store.ts` — retrieve (full-text + k-hop)

```typescript
export async function retrieve(
  driver: Driver,
  userIdentity: string,
  query: string,
  limit = 12,
): Promise<RetrievedMemory[]> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const res = await session.executeRead((tx) =>
      tx.run(
        `
        CALL db.index.fulltext.queryNodes('memoryItemDesc', $q) YIELD node, score
        WHERE node.userIdentity = $u AND node.redacted = false
        WITH node, score
        ORDER BY score DESC
        LIMIT 24
        MATCH (node)-[r*0..2]-(related:MemoryItem {userIdentity: $u})
        WHERE related.redacted = false
        RETURN DISTINCT
          related.itemId           AS itemId,
          related.type             AS type,
          related.description      AS description,
          related.validFrom        AS validFrom,
          related.sourceConversationId AS conversationId,
          max(score)               AS score
        ORDER BY score DESC
        LIMIT $limit
        `,
        { u: userIdentity, q: sanitizeFtsQuery(query), limit },
      ),
    );

    // Fire-and-forget: bump accessCount + lastAccessedAt for the returned items.
    const ids = res.records.map((r) => r.get("itemId") as string);
    if (ids.length) {
      void session.executeWrite((tx) =>
        tx.run(
          `
          UNWIND $ids AS id
          MATCH (m:MemoryItem {itemId: id})
          SET m.accessCount = coalesce(m.accessCount, 0) + 1,
              m.lastAccessedAt = datetime()
          `,
          { ids },
        ),
      );
    }

    return res.records.map((r) => ({
      itemId: r.get("itemId"),
      type: r.get("type"),
      description: r.get("description"),
      validFrom: r.get("validFrom").toString(),
      conversationId: r.get("conversationId"),
      score: r.get("score"),
    }));
  } finally {
    await session.close();
  }
}

function sanitizeFtsQuery(q: string): string {
  // Escape Lucene specials so user input can't break the FTS parser.
  return q.replace(/[+\-!(){}\[\]^"~*?:\\\/]/g, " ").trim() || "*";
}
```

### 2.6 `src/memory/extract/extractor.ts` — fire-and-forget LLM extraction

```typescript
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { ulid } from "ulid";
import { ExtractionOutputSchema } from "./schema.js";
import { redactSensitive } from "./redact.js";
import { extractionSystemPrompt } from "./prompt.js";

export async function extract(
  model: LanguageModel,
  userIdentity: string,
  userTurn: string,
  assistantTurn: string,
  conversationId: string,
  log: Logger,
) {
  const redacted = redactSensitive(`${userTurn}\n${assistantTurn}`);
  const started = Date.now();
  const { object } = await generateObject({
    model,
    schema: ExtractionOutputSchema,
    system: extractionSystemPrompt,
    prompt: redacted,
    maxRetries: 1,
  });
  const items = object.items.map((it) => ({ ...it, itemId: ulid() }));
  const relationships = object.relationships.map((r) => ({
    ...r,
    relationshipId: ulid(),
  }));
  log.info(
    {
      userIdentity,
      conversationId,
      itemCount: items.length,
      relCount: relationships.length,
      durationMs: Date.now() - started,
    },
    "[memory] extracted",
  );
  return { items, relationships };
}
```

### 2.7 `src/memory/agent-facade.ts` — MemoryAwareAgent wrapper

```typescript
import type { Agent } from "@voltagent/core";
import type { IdentityStore, MemoryStore } from "./ports/index.js";
import type { Extractor } from "./extract/extractor.js";
import type { Logger } from "pino";

export interface MemoryAwareAgentDeps {
  inner: Agent;
  identity: IdentityStore;
  store: MemoryStore;
  extract: Extractor;
  log: Logger;
}

export function createMemoryAwareAgent(deps: MemoryAwareAgentDeps) {
  const { inner, identity, store, extract, log } = deps;

  return {
    async generateText(args: {
      input: string;
      channel: string;
      channelUserId: string;
      conversationId: string;
    }) {
      const userIdentity = await identity.resolve({
        channel: args.channel,
        channelUserId: args.channelUserId,
      });

      const memories = await store.retrieve(userIdentity, args.input, 12);
      const memoryBlock = formatMemoriesForPrompt(memories);

      const response = await inner.generateText({
        input: args.input,
        conversationId: args.conversationId,
        userId: userIdentity,
        systemPromptAdditions: memoryBlock,
      });

      // Fire-and-forget extraction — never await, never block the reply.
      void extract(userIdentity, args.input, response.text, args.conversationId)
        .then((extracted) =>
          store.ingest(
            userIdentity,
            extracted.items,
            extracted.relationships,
            args.conversationId,
          ),
        )
        .catch((err) =>
          log.warn({ err, userIdentity }, "[memory] ingest failed"),
        );

      return response;
    },
  };
}
```

### 2.8 `src/memory/scheduler.ts` — nightly consolidation

```typescript
import type { Consolidator } from "./ports/consolidator.js";
import type { Logger } from "pino";

export function startConsolidationScheduler(
  consolidator: Consolidator,
  log: Logger,
  intervalMs = 24 * 60 * 60 * 1000,
) {
  const run = async () => {
    try {
      const report = await consolidator.runForAllUsers();
      log.info({ report }, "[memory] consolidation pass complete");
    } catch (err) {
      log.error({ err }, "[memory] consolidation failed");
    }
  };
  // kick off after 5 min to let the boot quiesce, then every 24h.
  const firstTimer = setTimeout(run, 5 * 60 * 1000);
  const repeatTimer = setInterval(run, intervalMs);
  return () => {
    clearTimeout(firstTimer);
    clearInterval(repeatTimer);
  };
}
```

### 2.9 `src/index.ts` — bootstrap wiring (edit)

```typescript
// existing imports …
import { createMemorySubsystem } from "./memory/index.js";

const memory = await createMemorySubsystem({ model, log });
// createMemorySubsystem internally:
//  - loads MemoryConfig from env
//  - calls createNeo4jDriver (returns null in degraded mode)
//  - applies migrations if driver present
//  - builds IdentityStore / MemoryStore / Consolidator / Extractor
//  - returns MemoryAwareAgent that wraps the existing Agent
//  - starts the consolidation scheduler

const agent = memory.wrap(baseAgent); // no-op in degraded mode
// pass `agent` to telegram.ts exactly as before
```

### 2.10 `src/channels/telegram.ts` — minimal edit

```typescript
// BEFORE
await agent.generateText({ input: text, conversationId });

// AFTER — channel metadata is the only new field.
await agent.generateText({
  input: text,
  conversationId,
  channel: "telegram",
  channelUserId: String(ctx.from.id),
});
```

## Progress Tracking

- [x] Phase 0 — research.md complete (Neo4j revision)
- [x] Phase 1 — data-model.md, contracts/, quickstart.md complete (Neo4j revision)
- [x] Phase 1 — agent context file (`.claude/CLAUDE.md`) updated
- [x] Plan constitution check: PASS with justified deviation (Complexity Tracking row filled)
- [x] Phase 2 planning — integration code snippets documented above
- [ ] Phase 3 — **`/speckit.tasks`** to emit `tasks.md` with test-first task breakdown
- [ ] Phase 4 — **`/speckit.implement`** to apply the tasks

## Artifacts

| Artifact         | Path                                                                                     | Status                               |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| Feature spec     | [spec.md](./spec.md)                                                                     | Unchanged (5 clarify sessions done)  |
| Research         | [research.md](./research.md)                                                             | Revision 2 (Neo4j)                   |
| Data model       | [data-model.md](./data-model.md)                                                         | Revision 2 (Neo4j Cypher + Zod)      |
| Service contract | [contracts/memory-service.contract.md](./contracts/memory-service.contract.md)           | Unchanged (DB-agnostic)              |
| Tools contract   | [contracts/memory-tools.contract.md](./contracts/memory-tools.contract.md)               | Unchanged                            |
| Channel contract | [contracts/channel-integration.contract.md](./contracts/channel-integration.contract.md) | Unchanged                            |
| Quickstart       | [quickstart.md](./quickstart.md)                                                         | Revision 2 (Neo4j verification path) |
| Plan (this file) | [plan.md](./plan.md)                                                                     | Revision 2                           |
