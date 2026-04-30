# Quickstart: Self-Improving Memory for Sirimath (Neo4j)

**Feature**: `specs/004-self-improving-memory/spec.md`
**Audience**: developer verifying the memory subsystem end-to-end.
**Revision**: 2 — Neo4j verification path replaces the SQLite path.

This is the authoritative manual-verification script. The repo has no automated test suite (see [CLAUDE.md](../../.claude/CLAUDE.md) Commands section), so these steps are how "it works" is proven before merge.

---

## 0. Prerequisites

### Start Neo4j (dev default)

```bash
docker run -d --name sirimath-neo4j \
  -p 7687:7687 -p 7474:7474 \
  -e NEO4J_AUTH=neo4j/test \
  -v sirimath-neo4j-data:/data \
  neo4j:5-community
```

Wait ~15 seconds, then open http://localhost:7474 and confirm you can sign in with `neo4j` / `test`.

### Env vars

Add to `.env`:

```
# ---- Memory subsystem ----
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=test
# Optional — enable vector retrieval (requires provider-side embedding API)
# MEMORY_EMBEDDINGS=provider

# ---- existing ----
TELEGRAM_BOT_TOKEN=...
MODEL_PROVIDER=openai            # or anthropic, azure, groq, ...
MODEL_ID=gpt-4o                  # or your choice
OPENAI_API_KEY=...               # whichever provider key matches MODEL_PROVIDER
ALLOWED_TELEGRAM_USER_IDS=12345  # your own Telegram numeric id
```

### Gate pre-checks

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

All three MUST pass with zero warnings before behavioural testing.

---

## 1. First boot — schema materialization

```bash
npm run dev
```

Expected structured pino log lines:

```
[memory] connecting to neo4j at bolt://localhost:7687
[memory] connectivity verified
[memory] migrations applied (version=1)
```

Confirm the schema via the Neo4j Browser (http://localhost:7474) — run:

```cypher
SHOW CONSTRAINTS;
```

You should see constraints for `UserIdentity`, `ChannelIdentityMapping`, `PairingCode`, `ConversationRecord`, `MemoryItem`, `ConsolidationReport`, and the relationship-id constraint. Then:

```cypher
SHOW INDEXES;
```

Expect range indexes on `MemoryItem(userIdentity, type)` / `(userIdentity, lastAccessedAt)`, `ConversationRecord(userIdentity, startedAt)`, `ConsolidationReport(userIdentity, ranAt)`, `PairingCode(expiresAt)`, and the full-text index `memoryItemDesc`.

If `MEMORY_EMBEDDINGS=provider` is set, also confirm:

```cypher
SHOW VECTOR INDEXES;
// expect: memoryItemEmbedding with dimensions=1536
```

### Degraded-mode sanity check

Stop Neo4j: `docker stop sirimath-neo4j`. Restart Sirimath:

```bash
npm run dev
```

Expected log:

```
[memory] NEO4J_URI is set but connectivity failed — memory disabled (agent stateless for long-term recall)
```

Send a Telegram message — agent MUST reply normally (FR-022). Restart Neo4j and Sirimath afterwards before continuing.

---

## 2. P1 verification — cross-session recall (SC-001)

### Session A (Day 1 simulated)

On Telegram, send three messages, each in its own turn:

1. `Call me Sam.`
2. `I'm migrating our payment service to Stripe.`
3. `We chose React Query over SWR because the server-state caching is cleaner.`

Fire-and-forget extraction logs:

```
[memory] extracted 3 items, 2 relationships in 843ms (userIdentity=01JD...)
```

Confirm in Neo4j Browser:

```cypher
MATCH (u:UserIdentity)<-[:OWNED_BY]-(m:MemoryItem)
RETURN u.userIdentity AS user, m.type AS type, m.description AS description
ORDER BY m.createdAt;
```

Expect at least: one `preference` ("Call me Sam"), one `entity` ("payment service migrating to Stripe"), one `decision` ("React Query over SWR + rationale").

### Session B (Day 2 simulated — simply start a fresh conversation)

Kill the process, restart it (`npm run dev`), then on Telegram in a **new conversation** (use `/start` or pick a different chat), send:

4. `What's my name again?` — assistant MUST reply using "Sam".
5. `What did we decide about data-fetching on the payment service?` — assistant MUST reference React Query AND the rationale.
6. `how do you know that?` — assistant MUST attribute to the Day-1 conversation (FR-010).

If any of the three fails, the P1 MVP is not shippable.

---

## 3. P1 verification — isolation (SC-003)

Temporarily add a second id to `ALLOWED_TELEGRAM_USER_IDS` (a friend's id or a second test account).

From that second account, send: `What do you remember about me?`

Expected reply: a polite "I don't remember anything about you yet — this is our first conversation." — **never** "you are Sam" or any leak from the first account. Repeat with 3 probe variants:

- `Tell me about the payment service`
- `What did we decide together?`
- `My friend uses Stripe, right?`

Verify in Neo4j that the two accounts have distinct `UserIdentity` nodes:

```cypher
MATCH (u:UserIdentity) RETURN u.userIdentity, u.createdAt;
MATCH (cim:ChannelIdentityMapping) RETURN cim.channel, cim.channelUserId, cim.userIdentity;
```

All MUST produce zero cross-user leakage and distinct ULIDs per account.

---

## 4. P1 verification — channel independence (SC-009)

Start the dry-run channel adapter (added as part of this feature):

```bash
npm run dryrun -- --user alice
```

In stdin, type: `My favorite language is Rust.` Observe reply, then Ctrl-D.

Confirm a new `UserIdentity` + `ChannelIdentityMapping` with `channel='dryrun'` appeared in Neo4j:

```cypher
MATCH (u:UserIdentity)<-[:BELONGS_TO]-(cim:ChannelIdentityMapping {channel: 'dryrun'})
RETURN u.userIdentity, cim.channelUserId;
```

Now run `/memory link` on Telegram (from Sam's account). Copy the printed 6-character code.

Restart `npm run dryrun -- --user alice`, type: `/memory link <code>`. Observe "Channels linked." reply.

Type: `What do you remember about me?` — you should see **Sam's** memory (name, payment service, React Query decision). Verify in Neo4j that both mappings now point at the same `UserIdentity`:

```cypher
MATCH (u:UserIdentity)<-[:BELONGS_TO]-(cim:ChannelIdentityMapping)
WHERE u.userIdentity IN [/* Sam's identity */]
RETURN cim.channel, cim.channelUserId;
```

This proves a second channel was added with **zero edits inside `src/memory/`**. SC-009 satisfied.

---

## 5. P2 verification — synthesis (SC-002)

From Sam's Telegram account:

1. `I'm also using PostgreSQL on the payment service.`
2. `Started a new side project called Bibliobot. It uses PostgreSQL too.`
3. `At work, our audit log service is built on PostgreSQL.`

Then ask: `What have I built with PostgreSQL?`

Assistant MUST list all three projects. Verify the graph supports this via:

```cypher
MATCH (postgres:MemoryItem)-[:OWNED_BY]->(u:UserIdentity)
WHERE postgres.description CONTAINS 'PostgreSQL' AND u.userIdentity = /* Sam's identity */
MATCH (postgres)<-[r:USES|PART_OF]-(project:MemoryItem)
RETURN project.description AS project, type(r) AS relation;
```

Three projects should appear.

---

## 6. P3 verification — consolidation (SC-005)

Populate synthetic data via the seed script:

```bash
npm run memory:seed -- --user 01JD...Sam --duplicates 50 --stale 10
```

Force a consolidation pass:

```bash
npm run memory:consolidate -- --user 01JD...Sam
```

Expected console output:

```
consolidation_report {
  merged: 48,           # ≥ 95% of 50 (SC-005 gate)
  pruned: 9,            # ≥ 90% of 10 (SC-005 gate)
  supersessionsRecorded: ?,
  contradictionsDetected: ?,
  summary: "Merged 48 duplicates, pruned 9 stale items..."
}
```

Verify no `decision`-type items were pruned:

```cypher
MATCH (m:MemoryItem:Decision {userIdentity: '01JD...Sam'})
RETURN count(m) AS decisionsRemaining;
```

Count MUST equal the count before the seed run.

---

## 7. User-control verification (FR-017–020, FR-020a/b/c)

Each of the following MUST behave identically whether issued as natural language or as the explicit command:

| Test | NL phrasing | Explicit command |
|---|---|---|
| View profile | `what do you remember about me?` | `/memory` |
| Forget one fact | `forget that I use Stripe` | `/forget Stripe` |
| Export | `export my memory` | `/export` |
| Erase all | `erase everything you know about me` | `/erase` |

For `forget` and `/erase`, expect an explicit confirmation prompt (FR-020c). Replying `yes` / the exact confirmation phrase completes the action; anything else cancels.

Verify `/erase` left the graph clean for Sam:

```cypher
MATCH (u:UserIdentity {userIdentity: '01JD...Sam'})<-[:OWNED_BY]-(m:MemoryItem)
RETURN count(m) AS remaining;   // MUST be 0

MATCH (u:UserIdentity {userIdentity: '01JD...Sam'})
OPTIONAL MATCH (u)<-[:WITH]-(c:ConversationRecord)
RETURN count(c) AS remainingConversations;  // MUST be 0
```

(The `UserIdentity` node itself MAY remain — `/erase` clears memory content, not identity registration. Revise if product direction differs.)

---

## 8. Latency sanity check (SC-004)

Instrument with a simple stopwatch or the pino `traceId`. Measure 20 consecutive turns:

```
baseline (no memory): ~400 ms average
with memory retrieval: ~? ms average
```

Delta MUST be ≤ 1000 ms on average across the 20 samples. If it exceeds the budget, the `retrieve()` implementation is probably running the LLM re-rank on too many candidates — reduce `limit` or skip re-rank for queries < 4 chars.

---

## 9. Failure injection (FR-022)

Stop Neo4j while the agent is running:

```bash
docker stop sirimath-neo4j
```

Send a Telegram message. Expected: agent replies normally (without memory context) AND appends a warning ("Memory is temporarily unavailable — answering from this conversation only."). The agent does NOT crash.

Restore: `docker start sirimath-neo4j`. Next turn: memory available, warning gone.

---

## 10. Sign-off

A reviewer who ticked all nine blocks above has verified the feature against P1, P2, P3, and the six success criteria the manual path can cover (SC-001, SC-002, SC-003, SC-004, SC-005, SC-009). SC-006, SC-007, SC-008 require longer-running scripts documented in `specs/004-self-improving-memory/tasks.md` (emitted by `/speckit.tasks`).

Only then may the branch be merged.
