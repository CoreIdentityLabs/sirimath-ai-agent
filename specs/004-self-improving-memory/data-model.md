# Phase 1 Data Model: Self-Improving Memory (Neo4j)

**Feature**: `specs/004-self-improving-memory/spec.md`
**Depends on**: [research.md](./research.md)
**Revision**: 2 — Neo4j graph model replaces the relational schema.

All entities are backed by **Neo4j 5.x** nodes and relationships. Every node carries a `userIdentity` string property that is the sole isolation boundary (FR-009); every Cypher query MUST filter on it.

This document specifies:
- The Zod schemas (authoritative runtime types; DB-agnostic)
- The Cypher constraints and indexes that materialize them
- The label + relationship vocabulary
- State-transition rules
- Validation rules traced back to functional requirements

---

## 1. Entity overview

| Entity | Neo4j label | Spec FR / Section |
|---|---|---|
| User Identity | `:UserIdentity` | FR-025, FR-026 |
| Channel Identity Mapping | `:ChannelIdentityMapping` | FR-026, FR-028 |
| Pairing Code | `:PairingCode` | FR-028a |
| User Profile | `:UserProfile` | Key Entities |
| Conversation Record | `:ConversationRecord` | Key Entities, FR-003 |
| Memory Item | `:MemoryItem` + one of {`:Entity`, `:Concept`, `:Decision`, `:Preference`, `:Event`} | FR-001, FR-002 |
| Relationship | edge of type `:USES` / `:DEPENDS_ON` / `:DECIDED_TO` / `:SUPERSEDES` / `:PART_OF` / `:CONTRADICTS` / `:CLARIFIES` | FR-004 |
| Consolidation Report | `:ConsolidationReport` | FR-016, Key Entities |

Dual-labelling Memory Items (`:MemoryItem:Decision` etc.) lets Cypher pattern-match the type cheaply without a `WHERE m.type = 'decision'` predicate — indexes can be built per sub-label when needed.

---

## 2. Zod schemas (authoritative)

> File: `src/memory/schema.ts`. Identical to revision 1's contract except where noted — Zod is the DB-agnostic source of truth; the Neo4j layer just materializes it. Embedding field is new (optional, opt-in).

```typescript
import { z } from "zod";

export const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export const channelName = z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/);

export const MemoryItemTypeSchema = z.enum([
  "entity", "concept", "decision", "preference", "event",
]);
export type MemoryItemType = z.infer<typeof MemoryItemTypeSchema>;

export const RelationshipTypeSchema = z.enum([
  "uses", "depends_on", "decided_to", "supersedes", "part_of", "contradicts", "clarifies",
]);
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const UserIdentitySchema = z.object({
  userIdentity: ulid,
  createdAt: z.coerce.date(),
});
export type UserIdentity = z.infer<typeof UserIdentitySchema>;

export const ChannelIdentityMappingSchema = z.object({
  mappingId: ulid,
  userIdentity: ulid,
  channel: channelName,
  channelUserId: z.string().min(1).max(256),
  linkedAt: z.coerce.date(),
});
export type ChannelIdentityMapping = z.infer<typeof ChannelIdentityMappingSchema>;

export const PairingCodeSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  userIdentity: ulid,
  issuingChannel: channelName,
  issuedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  consumedAt: z.coerce.date().nullable(),
});
export type PairingCode = z.infer<typeof PairingCodeSchema>;

export const UserProfileSchema = z.object({
  userIdentity: ulid,
  displayName: z.string().max(128).nullable(),
  preferences: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.coerce.date(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const ConversationRecordSchema = z.object({
  conversationId: z.string().min(1).max(256),
  userIdentity: ulid,
  channel: channelName, // informational — NEVER used for isolation (FR-009)
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
  transcript: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      at: z.coerce.date(),
    }),
  ),
});
export type ConversationRecord = z.infer<typeof ConversationRecordSchema>;

export const MemoryItemSchema = z.object({
  itemId: ulid,
  userIdentity: ulid,
  type: MemoryItemTypeSchema,
  description: z.string().min(3).max(1024),
  sourceConversationId: z.string().min(1).max(256),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().nullable(), // supersession date (FR-014)
  accessCount: z.number().int().nonnegative().default(0),
  lastAccessedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  redacted: z.boolean().default(false),
  embedding: z.array(z.number()).length(1536).optional(), // NEW: opt-in vector
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;

export const RelationshipSchema = z.object({
  relationshipId: ulid,
  userIdentity: ulid,
  fromItemId: ulid,
  toItemId: ulid,
  type: RelationshipTypeSchema,
  confidence: z.number().min(0).max(1),
  description: z.string().max(256).nullable(),
  createdAt: z.coerce.date(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const ConsolidationReportSchema = z.object({
  reportId: ulid,
  userIdentity: ulid,
  ranAt: z.coerce.date(),
  merged: z.number().int().nonnegative(),
  pruned: z.number().int().nonnegative(),
  supersessionsRecorded: z.number().int().nonnegative(),
  contradictionsDetected: z.array(
    z.object({
      itemIdA: ulid,
      itemIdB: ulid,
      reason: z.string(),
      resolved: z.boolean().default(false),
    }),
  ),
  summary: z.string(),
});
export type ConsolidationReport = z.infer<typeof ConsolidationReportSchema>;

export const ExtractedItemSchema = z.object({
  type: MemoryItemTypeSchema,
  description: z.string().min(3).max(512),
});

export const ExtractedRelationshipSchema = z.object({
  fromDescription: z.string().min(3).max(512),
  toDescription: z.string().min(3).max(512),
  type: RelationshipTypeSchema,
  description: z.string().max(256).nullable().default(null),
});

export const ExtractionResultSchema = z.object({
  items: z.array(ExtractedItemSchema).max(20),
  relationships: z.array(ExtractedRelationshipSchema).max(20),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
```

---

## 3. Cypher schema (constraints, indexes, full-text, vector)

> File: `src/memory/store/migrations.cypher`. Applied idempotently on first start (each statement uses `IF NOT EXISTS`). No ALTER-equivalent needed — Cypher is declarative.

```cypher
// =====================================================
// MIGRATION 001 — initial memory subsystem (Neo4j 5.x)
// =====================================================

// ---------- Uniqueness constraints ----------
CREATE CONSTRAINT user_identity_id IF NOT EXISTS
  FOR (u:UserIdentity) REQUIRE u.userIdentity IS UNIQUE;

CREATE CONSTRAINT cim_composite IF NOT EXISTS
  FOR (m:ChannelIdentityMapping)
  REQUIRE (m.channel, m.channelUserId) IS UNIQUE;

CREATE CONSTRAINT cim_id IF NOT EXISTS
  FOR (m:ChannelIdentityMapping) REQUIRE m.mappingId IS UNIQUE;

CREATE CONSTRAINT pairing_code_unique IF NOT EXISTS
  FOR (p:PairingCode) REQUIRE p.code IS UNIQUE;

CREATE CONSTRAINT profile_owner IF NOT EXISTS
  FOR (p:UserProfile) REQUIRE p.userIdentity IS UNIQUE;

CREATE CONSTRAINT conv_composite IF NOT EXISTS
  FOR (c:ConversationRecord)
  REQUIRE (c.userIdentity, c.conversationId) IS UNIQUE;

CREATE CONSTRAINT mi_id IF NOT EXISTS
  FOR (m:MemoryItem) REQUIRE m.itemId IS UNIQUE;

CREATE CONSTRAINT rel_id IF NOT EXISTS
  FOR ()-[r:USES|DEPENDS_ON|DECIDED_TO|SUPERSEDES|PART_OF|CONTRADICTS|CLARIFIES]-()
  REQUIRE r.relationshipId IS UNIQUE;

CREATE CONSTRAINT report_id IF NOT EXISTS
  FOR (r:ConsolidationReport) REQUIRE r.reportId IS UNIQUE;

// ---------- Property existence (Neo4j 5 Enterprise — skipped for Community) ----------
// In Community Edition these are enforced at the driver layer via Zod before persist.

// ---------- Range indexes for fast isolation filter ----------
CREATE INDEX mi_user_type IF NOT EXISTS
  FOR (m:MemoryItem) ON (m.userIdentity, m.type);

CREATE INDEX mi_stale IF NOT EXISTS
  FOR (m:MemoryItem) ON (m.userIdentity, m.lastAccessedAt);

CREATE INDEX conv_user_time IF NOT EXISTS
  FOR (c:ConversationRecord) ON (c.userIdentity, c.startedAt);

CREATE INDEX report_user_time IF NOT EXISTS
  FOR (r:ConsolidationReport) ON (r.userIdentity, r.ranAt);

CREATE INDEX pairing_expiry IF NOT EXISTS
  FOR (p:PairingCode) ON (p.expiresAt);

// ---------- Full-text index for keyword retrieval ----------
CREATE FULLTEXT INDEX memoryItemDesc IF NOT EXISTS
  FOR (m:MemoryItem) ON EACH [m.description]
  OPTIONS { indexConfig: { `fulltext.analyzer`: 'standard' } };

// ---------- Vector index (OPTIONAL — created only if MEMORY_EMBEDDINGS=provider) ----------
// Applied by a separate migration step gated on env var; see driver.ts.
// CREATE VECTOR INDEX memoryItemEmbedding IF NOT EXISTS
//   FOR (m:MemoryItem) ON m.embedding
//   OPTIONS { indexConfig: {
//     `vector.dimensions`: 1536,
//     `vector.similarity_function`: 'cosine'
//   } };
```

---

## 4. Relationship vocabulary

### Structural relationships (fixed, not user-facing)

| Edge | From | To | Purpose |
|---|---|---|---|
| `(ChannelIdentityMapping)-[:BELONGS_TO]->(UserIdentity)` | mapping | identity | links channel-native id to internal identity (FR-026) |
| `(PairingCode)-[:ISSUED_BY]->(UserIdentity)` | code | identity | binds a code to its issuer (FR-028a) |
| `(UserProfile)-[:PROFILE_OF]->(UserIdentity)` | profile | identity | 1–1 profile |
| `(ConversationRecord)-[:WITH]->(UserIdentity)` | conversation | identity | ownership; isolation (FR-009) |
| `(MemoryItem)-[:OWNED_BY]->(UserIdentity)` | item | identity | ownership; isolation predicate on every query |
| `(MemoryItem)-[:SOURCED_FROM]->(ConversationRecord)` | item | conversation | attribution (FR-003, FR-010) |
| `(ConsolidationReport)-[:RAN_FOR]->(UserIdentity)` | report | identity | ownership |

### Semantic relationships (user-facing, from FR-004 and the extractor)

| Edge | Meaning | Confidence + description carried on edge |
|---|---|---|
| `(MemoryItem)-[:USES]->(MemoryItem)` | "user uses X in Y" | yes |
| `(MemoryItem)-[:DEPENDS_ON]->(MemoryItem)` | "X depends on Y" | yes |
| `(MemoryItem)-[:DECIDED_TO]->(MemoryItem)` | decision → chosen option | yes |
| `(MemoryItem)-[:SUPERSEDES]->(MemoryItem)` | FR-014 | yes (strong confidence) |
| `(MemoryItem)-[:PART_OF]->(MemoryItem)` | subsumption | yes |
| `(MemoryItem)-[:CONTRADICTS]->(MemoryItem)` | FR-013 — flagged, not auto-resolved | yes |
| `(MemoryItem)-[:CLARIFIES]->(MemoryItem)` | refinement | yes |

All semantic edges carry the same shape (`relationshipId`, `type`, `confidence`, `description`, `createdAt`) plus an implicit `userIdentity` (both endpoints share it — enforced at write time).

---

## 5. Node property schemas

Each label's properties correspond 1:1 to the Zod schema fields in §2, with one exception: `MemoryItem.embedding` is a list of floats persisted only when the vector-index migration is applied.

Dates are stored as ISO-8601 strings (Neo4j has a native `datetime` type, but Zod's `z.coerce.date()` handles ISO strings symmetrically and keeps the store code trivial). If we later need temporal Cypher queries (`datetime() < c.startedAt`), a separate driver helper does the conversion — not a schema change.

---

## 6. State transitions

### `MemoryItem`
```
created → active   (validFrom = now, validUntil = NULL)
active  → superseded   (FR-014: new fact disagrees; validUntil = now; CREATE (:MemoryItem {new})-[:SUPERSEDES]->(old))
active  → pruned   (FR-015: type ≠ 'decision' AND lastAccessedAt < now - 90d — DETACH DELETE)
active  → deleted  (FR-017 explicit user forget + FR-020c confirm — DETACH DELETE)
```

### `PairingCode`
```
issued    → consumed (FR-028a success path: SET consumedAt = now)
issued    → expired  (expiresAt < now, consumedAt still NULL — purged by consolidation cleanup)
```
- Purge rule: a daily Cypher `MATCH (p:PairingCode) WHERE p.expiresAt < datetime() - duration({days: 1}) DETACH DELETE p` runs alongside consolidation.
- Redemption on the issuing channel is rejected before transitioning (research §7).

### `Relationship` edges
- Immutable once created. Consolidation inserts new edges; stale ones are deleted. No update-in-place.

### `ConsolidationReport`
- Append-only. Never updated, never deleted.

---

## 7. Validation rules (traced to FRs)

| Rule | Enforced where | FR |
|---|---|---|
| `memory_item.sourceConversationId` must reference an existing `ConversationRecord` under the same `userIdentity` | store's `addMemoryItem` runs `MATCH (c:ConversationRecord {userIdentity:$u, conversationId:$cid}) RETURN c` first; FK-like guard | FR-003 |
| `memory_item.description.length ∈ [3, 1024]` | Zod | FR-001 |
| `memory_item.type` ∈ closed enum | Zod; dual-label at persist | FR-002 |
| Relationship endpoints MUST share the same `userIdentity` | store's `addRelationship` runs a single Cypher WRITE with both `userIdentity` predicates | FR-009 |
| Every retrieve / traverse query MUST filter by `userIdentity` | `neo4j-store.ts` takes `userIdentity` as the first positional argument on every method | FR-009, SC-003 |
| Pairing-code lookup MUST fail if `consumedAt IS NOT NULL` OR `expiresAt < now()` | `identity.ts` Cypher: `MATCH (p:PairingCode {code:$c}) WHERE p.consumedAt IS NULL AND p.expiresAt > datetime()` | FR-028a |
| Pairing-code redemption on `issuingChannel` rejected | `identity.ts` pre-check | research §7 |
| Redacted spans replaced BEFORE extractor LLM call | `ingest.ts` sanitize step | FR-006 |
| Destructive ops require confirmation state | tool handlers + pending-op state (in tool's `operationContext`) | FR-020c |

---

## 8. Example persisted graph (developer reference)

```cypher
// After a user says "Call me Sam. I'm migrating to Stripe. We chose React Query over SWR."

MERGE (u:UserIdentity {userIdentity: "01JD5K2Q..."})
  ON CREATE SET u.createdAt = datetime();

MERGE (c:ConversationRecord {
  userIdentity: "01JD5K2Q...", conversationId: "telegram:123456789"
})
  ON CREATE SET c.channel = "telegram", c.startedAt = datetime(), c.transcript = "[...]"
MERGE (c)-[:WITH]->(u);

MERGE (m1:MemoryItem:Preference {itemId: "01JD5K9T0AAAA"})
  ON CREATE SET m1.userIdentity = "01JD5K2Q...",
                m1.type = "preference",
                m1.description = "User wants to be called Sam",
                m1.sourceConversationId = "telegram:123456789",
                m1.validFrom = datetime(),
                m1.accessCount = 0,
                m1.createdAt = datetime(),
                m1.redacted = false
MERGE (m1)-[:OWNED_BY]->(u)
MERGE (m1)-[:SOURCED_FROM]->(c);

MERGE (m2:MemoryItem:Decision {itemId: "01JD5K9T0BBBB"})
  ON CREATE SET m2.userIdentity = "01JD5K2Q...",
                m2.type = "decision",
                m2.description = "Chose React Query over SWR for payment service — server-state caching ergonomics"
MERGE (m2)-[:OWNED_BY]->(u)
MERGE (m2)-[:SOURCED_FROM]->(c);

MERGE (m3:MemoryItem:Entity {itemId: "01JD5K9T0CCCC"})
  ON CREATE SET m3.type = "entity", m3.description = "payment service (being migrated to Stripe)"
MERGE (m3)-[:OWNED_BY]->(u)
MERGE (m3)-[:SOURCED_FROM]->(c);

// Relationships: the React Query decision is PART_OF the payment-service entity
MERGE (m2)-[r:PART_OF {relationshipId: "01JD5K9T0DDDD"}]->(m3)
  ON CREATE SET r.userIdentity = "01JD5K2Q...",
                r.confidence = 0.95,
                r.description = "decision belongs to the payment-service project",
                r.createdAt = datetime();
```

Reading it back (illustrates P1 "what did we decide about data-fetching?"):

```cypher
CALL db.index.fulltext.queryNodes('memoryItemDesc', 'data fetching payment') YIELD node, score
WHERE node.userIdentity = "01JD5K2Q..."
WITH node, score
MATCH (node)-[r*0..2]-(related:MemoryItem {userIdentity: "01JD5K2Q..."})
RETURN DISTINCT related.itemId AS id, related.type AS type, related.description AS description
ORDER BY score DESC
LIMIT 24;
```

---

## 9. Schema evolution

- Migrations live in `src/memory/store/migrations.cypher` as numbered blocks (`// MIGRATION 001`, `// MIGRATION 002`, …).
- Applied idempotently via `IF NOT EXISTS` on every restart; a small `:SchemaVersion` node records the highest applied migration number to skip already-run blocks when the schema set grows.
- Any schema change that affects the zero-extra-cost contract or the per-user isolation rule MUST be paired with an update to the Constitution Check / Complexity Tracking entries in [plan.md](./plan.md).
