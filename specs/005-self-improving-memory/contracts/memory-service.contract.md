# Contract: Memory Service (internal interface)

**Feature**: `specs/005-self-improving-memory/spec.md`
**Role**: The single public surface of `src/memory/` consumed by the rest of the agent.

Every channel adapter, every agent tool, and every scheduled job MUST reach the memory subsystem through this interface — not by importing concrete modules or touching the SQLite file directly.

This contract is the load-bearing boundary for:

- **Channel independence** (FR-025–029): only the methods below are allowed to cross `src/channels/ ↔ src/memory/`.
- **Per-user isolation** (FR-009, SC-003): every method takes `userIdentity` as its first typed argument.

---

## Interface

```typescript
// src/memory/index.ts (public barrel)

import type {
  UserIdentity,
  ChannelIdentityMapping,
  MemoryItem,
  Relationship,
  ConversationRecord,
  ConsolidationReport,
  UserProfile,
} from "./schema";

export interface IdentityStore {
  /** FR-026: resolve channel-native id to an internal user_identity; create on first sight. */
  resolveOrCreate(channel: string, channelUserId: string): Promise<string>;

  /** FR-028a: issue a pairing code bound to the caller's user_identity and issuing channel. */
  issuePairingCode(
    userIdentity: string,
    issuingChannel: string,
  ): Promise<{ code: string; expiresAt: Date }>;

  /**
   * FR-028a/b: consume a pairing code submitted on a NEW channel.
   * Rejects when: expired, consumed, issued on this same channel, or unknown.
   * On success, adds a new ChannelIdentityMapping under the code's user_identity
   * and returns that user_identity so the caller can use it for subsequent turns.
   */
  consumePairingCode(
    newChannel: string,
    newChannelUserId: string,
    code: string,
  ): Promise<
    | { ok: true; userIdentity: string }
    | { ok: false; reason: "expired" | "consumed" | "same_channel" | "unknown" }
  >;

  /** Lookup all mappings for a given user_identity (for "what do you remember about me"). */
  listChannels(userIdentity: string): Promise<ChannelIdentityMapping[]>;
}

export interface MemoryStore {
  /** FR-003: persist the full Conversation Record and FR-001..004: persist extracted items/edges. */
  persistConversationRecord(record: ConversationRecord): Promise<void>;

  addMemoryItem(item: MemoryItem): Promise<void>;
  addRelationship(rel: Relationship): Promise<void>;

  /**
   * FR-007/008: hybrid retrieval for the current user.
   * Pipeline: FTS5 keyword match → graph expansion (1-hop BFS) → LLM re-rank → top-K.
   * Returns at most `limit` items, in relevance order.
   */
  retrieve(
    userIdentity: string,
    query: string,
    limit?: number, // default 8
  ): Promise<MemoryItem[]>;

  /** FR-018: user-readable profile dump. */
  viewProfile(userIdentity: string): Promise<{
    profile: UserProfile | null;
    itemCount: number;
    recentItems: MemoryItem[]; // most recent ~20
  }>;

  /** FR-019: full export in plain human-readable text (Markdown). */
  exportAll(userIdentity: string): Promise<string>;

  /** FR-017: delete a specific item by id (idempotent). */
  forgetItem(userIdentity: string, itemId: string): Promise<{ ok: boolean }>;

  /** FR-020: complete erasure of all memory under user_identity (idempotent). */
  eraseAll(
    userIdentity: string,
  ): Promise<{ deletedItems: number; deletedRecords: number }>;

  /** Attribution helper for FR-010: traces an item back to its conversation. */
  attribute(
    userIdentity: string,
    itemId: string,
  ): Promise<{
    item: MemoryItem;
    sourceConversation: {
      conversationId: string;
      channel: string;
      startedAt: Date;
    };
  } | null>;

  /** FR-016: list consolidation reports, newest first. */
  listConsolidationReports(
    userIdentity: string,
    limit?: number,
  ): Promise<ConsolidationReport[]>;
}

export interface Consolidator {
  /** FR-012..016: run one consolidation pass for a user; returns the report persisted. */
  runOnce(userIdentity: string): Promise<ConsolidationReport>;

  /**
   * Run one consolidation pass for EVERY user identity in the store.
   * Called by the nightly scheduler. Errors for individual users are caught
   * and logged; the loop continues for remaining users.
   */
  runForAllUsers(): Promise<void>;

  /** Starts the daily scheduled pass (once per process). Safe to call multiple times — idempotent. */
  startScheduled(): void;

  /** Cleanly stop the scheduled pass (for tests/shutdown). */
  stopScheduled(): void;
}
```

---

## Guarantees the implementation MUST provide

1. **No method ever returns data belonging to a different `user_identity`.** Internally every SQL query includes `WHERE user_identity = ?` as its first predicate — tested by SC-003 red-team probes.
2. **All timestamps are stored as ISO-8601 UTC strings** (SQLite has no native date type). Zod `z.coerce.date()` handles round-tripping.
3. **Every mutating method is idempotent** with respect to its natural key:
   - `resolveOrCreate` — keyed on `(channel, channel_user_id)`
   - `forgetItem` — no-op if item already gone
   - `eraseAll` — no-op on empty
   - `consumePairingCode` — a consumed code is rejected on the second attempt
4. **`retrieve` MUST complete in < 1 s** on the zero-extra-cost path for stores up to 10 000 items (SC-004, SC-006). If it cannot, it SHOULD degrade gracefully: return the FTS-only result set without the LLM re-rank and log a warning (FR-022 — assistant never fails to respond).
5. **No method ever throws on a missing user** — methods return empty results or `{ ok: false, ... }`. This is how `eraseAll` can be called for a user that has no memory yet.

---

## What the interface does NOT promise

- No guarantee about ordering other than `retrieve` (relevance order) and `listConsolidationReports` (ran_at DESC).
- No transactional bundle across methods — callers must treat each method call as its own unit of work.
- No real-time cross-process coherence — SQLite file-level locking is the only consistency primitive.

---

## How the façade `MemoryAwareAgent` uses this contract

```text
Channel adapter                 MemoryAwareAgent                Memory subsystem
─────────────────             ──────────────────               ──────────────────
message arrives  ───►  identityStore.resolveOrCreate          IdentityStore
                          (channel, channelUserId)
                ◄───  userIdentity

                       memoryStore.retrieve                    MemoryStore
                          (userIdentity, text, 8)
                ◄───  MemoryItem[]

                       build preamble ↓ (bounded ~2 kB)
                       agent.generateText(
                         preamble + text,
                         { userId: userIdentity, conversationId }
                       )
                ◄───  reply text

                       memoryStore.persistConversationRecord   MemoryStore
                       ingest.extractAndPersist  (fire-and-forget)

send reply       ◄───  reply text
```
