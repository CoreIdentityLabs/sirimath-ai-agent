# Feature Specification: Self-Improving Memory for Sirimath

**Feature Branch**: `004-self-improving-memory`
**Created**: 2026-04-19
**Status**: Draft
**Input**: User description: "As a user I need to integrate a self improving feature for sirimath. Where sirimath should be able to memories conversations and related decisions based on the llm wikis and open-graph-memory. This feature should not be coupled to Telegram, since Sirimath can work on any channel. Hence this feature should be generic."

**Referenced research**:

- [LLM Wiki pattern (Karpathy)](../../src/docs/run-deep-resarch-on-https-gist-github-com-karpathy.md) — ingest → query → lint cycle, persistent compounding knowledge base
- [open-graph-memory-mcp (CoreIdentityLabs)](../../src/docs/https-github-com-coreidentitylabs-open-graph-memor.md) — graph-based memory with entities, relationships, deep analysis, consolidation
- [Hermes Agent (Nous Research)](../../src/docs/run-deep-research-on-https-github-com-nousresearch.md) — bounded memory files + unbounded session search, self-improving skills

---

## Clarifications

### Session 2026-04-20

- Q: Expected scale of the memory system (how many users should it be designed for?) → A: Single user — the operator. One User Identity is the expected steady state; per-user isolation is still retained for multi-speaker edge cases (group rooms) and for the optional future promotion to a larger deployment.
- Q: How should users invoke memory-control operations (forget / view / export / erase)? → A: Both natural-language intent and explicit commands. NL dispatch is primary and channel-agnostic; a small set of explicit commands exists as an unambiguous fallback for destructive operations (erase-all, forget).
- Q: How should the consolidation summary reach the user? → A: Pull on request — summary is persisted and returned when the user asks ("what changed in memory?"). Contradictions that require user resolution are the exception: they are surfaced proactively at the start of the next conversation.
- Q: Are `Memory Item (type=conversation snapshot)` and `Conversation Record` the same persisted entity or two distinct ones? → A: Two distinct entities. Memory Items hold atomic facts (entity, concept, decision, preference, event) and link back to the Conversation Record they were extracted from. Conversation Records hold the full turn-by-turn transcript and source metadata. `conversation snapshot` is removed from the Memory Item type enum.
- Q: How should a user initiate and prove a cross-channel identity link? → A: User-initiated via pairing code. On the already-linked channel the user asks Sirimath to "link a new channel"; Sirimath issues a short-lived, single-use pairing code; the user sends that code from the new channel within the validity window; Sirimath verifies and links the two channel identities to the same internal User Identity.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sirimath Remembers Me Across Conversations (Priority: P1)

As a regular user of Sirimath on any supported channel, I want the assistant to recall facts I have told it, projects I am working on, and decisions we have made together — even after days or weeks of no contact — so I do not have to re-explain my context every time I open a new conversation.

**Why this priority**: This is the core value proposition. Without persistence across sessions, Sirimath behaves like any stateless assistant. With it, Sirimath becomes a personal companion that compounds in usefulness the more it is used. Every other memory capability depends on this foundation working.

**Independent Test**: Have a conversation with Sirimath on Day 1 in which you mention (a) a factual preference ("I prefer metric units"), (b) a project detail ("I'm migrating our payment service to Stripe"), and (c) a decision ("We chose React Query over SWR"). End the session. On Day 2, start a new session and ask questions whose answers require each piece of remembered context. All three should be recalled accurately and attributed to the earlier conversation. The test must pass regardless of which channel (Telegram today, or any channel added in the future) the sessions occur on.

**Acceptance Scenarios**:

1. **Given** a user has never interacted with Sirimath before, **When** the user shares a personal preference (e.g., "call me Sam"), **Then** Sirimath stores it and uses the name in the same conversation and all subsequent conversations.
2. **Given** the user previously discussed a project in an earlier session, **When** the user opens a new conversation and references that project by a keyword, **Then** Sirimath recognizes the reference and pulls in relevant prior details without the user re-explaining.
3. **Given** the user made a decision in a past conversation, **When** the user later asks "what did we decide about X?", **Then** Sirimath recalls the decision and the reasoning behind it.
4. **Given** two different users interact with Sirimath (on the same channel or on different channels), **When** each asks about "my project", **Then** each receives only their own remembered context, never the other user's.
5. **Given** a new channel is added to Sirimath in the future, **When** a user interacts through that new channel, **Then** the memory system works without channel-specific code changes — only the channel identity mapping needs to be configured.

---

### User Story 2 - Sirimath Answers Using Compounded Knowledge (Priority: P2)

As a user who has had many conversations with Sirimath, I want Sirimath to synthesize answers that draw on patterns and connections across all of my past conversations — not just the single most recent one — so that complex questions benefit from the full history of what I have shared.

**Why this priority**: Single-conversation recall (P1) already delivers the "I remember you" experience. P2 unlocks the compounding value: after enough conversations, Sirimath can answer "what entities have I asked about most?", "what decisions have I made about authentication across all my projects?", or "are any of my stated preferences contradicting each other?". This is what turns memory from a storage system into a self-improving knowledge base.

**Independent Test**: Over several sessions, tell Sirimath about three separate projects that each involve the same entity (e.g., "PostgreSQL"). Then ask a question that requires Sirimath to aggregate across those projects (e.g., "What have I built with PostgreSQL?"). Sirimath should produce a coherent answer referencing all three projects, without the user restating them.

**Acceptance Scenarios**:

1. **Given** the user has mentioned the same named entity in multiple past conversations, **When** the user asks about that entity, **Then** Sirimath produces an answer that draws on all remembered mentions, not only the most recent one.
2. **Given** the user asks an analytical question like "what decisions have I made about X?", **When** Sirimath has records of relevant past decisions, **Then** Sirimath returns a structured summary (list or table) of those decisions with the context in which each was made.
3. **Given** two previously recorded facts contradict each other, **When** the user asks a question that would surface the contradiction, **Then** Sirimath flags the contradiction explicitly rather than picking one silently.

---

### User Story 3 - Memory Stays Healthy Automatically (Priority: P3)

As a user, I expect Sirimath's memory to stay accurate and relevant over time without me having to curate it manually. Outdated facts should fade, duplicate entries from slightly different phrasings should merge, stale information that was never revisited should be pruned, and contradictions should be surfaced for review.

**Why this priority**: Personal knowledge systems historically fail because of the maintenance burden. A self-improving memory is the whole point of the feature name — this story is what makes the memory sustainable in the long run. It can ship after P1 and P2 because memory health only begins to degrade meaningfully once there is enough memory to degrade.

**Independent Test**: Populate Sirimath's memory with 50+ conversations over simulated time, including duplicates (same entity described two different ways), updates (earlier fact superseded by later fact), and never-revisited items. Trigger (or wait for) the consolidation process. Verify: duplicates merged into single entries, superseded facts marked as historical, never-revisited items older than the retention window removed, and a summary of changes is available for the user to review.

**Acceptance Scenarios**:

1. **Given** Sirimath has accumulated memory over time, **When** the consolidation process runs on schedule, **Then** duplicate entities are merged, stale unused entries are pruned, and the user can view a summary of what changed.
2. **Given** the user states a new fact that contradicts a previously stored fact, **When** the new fact is stored, **Then** the older fact is preserved with a "superseded on [date]" marker rather than overwritten silently.
3. **Given** the memory system detects an unresolved contradiction during consolidation, **When** the next conversation starts, **Then** Sirimath can surface the contradiction to the user and ask which version is correct.
4. **Given** the user explicitly asks Sirimath to forget a specific item, **When** the user confirms the deletion, **Then** that item and its direct relationships are removed from memory on the next turn.

---

### Edge Cases

- **Transcribed input (voice, images, other media)**: When the user sends input that is not plain text (e.g., a voice message that is transcribed, an image whose text is extracted), the transcription/extraction must be ingested into memory the same way a text message is, with no loss of fidelity for entities and decisions mentioned.
- **Ambiguous references**: When the user says "that project" without a clear antecedent, Sirimath should ask for clarification rather than guess and record a wrong link.
- **Contradicting a high-confidence past statement**: When the user makes a statement that contradicts a confidently stored memory, Sirimath should acknowledge the contradiction in the same turn and ask whether the new statement replaces the old.
- **Sensitive content**: When the user shares information that reads as a credential, secret, or other clearly sensitive value, Sirimath must not store that value in memory (either store a redacted summary or skip ingestion of that specific item and tell the user).
- **Very long conversations**: When a single conversation exceeds the model's practical context length, memory ingestion must still capture key entities and decisions from earlier turns that would otherwise scroll out of context.
- **User clears chat history on their client**: Memory persists on the server side; deleting local chat history on any channel does not delete memory. Users must be able to request deletion of their server-side memory explicitly.
- **Multi-user channels (group chats, shared rooms)**: If Sirimath is used in a multi-user channel, per-user memory isolation must still be enforced based on each speaker's stable user identity, never on the conversation or channel-room identity.
- **Same human on multiple channels**: The same person might reach Sirimath through two different channels (e.g., Telegram today, Slack tomorrow). By default, memory is scoped to the channel-level identity. Operators or users MAY optionally link identities across channels to share memory; this linking must be explicit, not automatic.
- **Cold start on the first message of a new session**: The first response in a new conversation must still be fast even if the agent has to load relevant prior memory.
- **New channel added later**: Adding a new input/output channel to Sirimath must not require changes to the memory system itself — only a small mapping from that channel's user identity to Sirimath's internal user identity.

---

## Requirements _(mandatory)_

### Functional Requirements

#### Memory Capture (Ingest)

- **FR-001**: The system MUST automatically extract memorable information from every user–assistant turn, including named entities (people, tools, projects, services), decisions (with their rationale when stated), user preferences, and significant events.
- **FR-002**: The system MUST classify each extracted Memory Item by type so that entities, concepts, decisions, preferences, and events are distinguishable downstream. (Full-conversation transcripts are stored as separate Conversation Records, not as a Memory Item type — see Key Entities.)
- **FR-003**: The system MUST record the source conversation and timestamp for every stored memory item so that any answer drawn from memory is traceable back to when and where it was learned.
- **FR-004**: The system MUST capture relationships between items (e.g., "user uses React Query in project X", "decision Y supersedes decision Z") as first-class links, not only as free text inside item descriptions.
- **FR-005**: The system MUST ingest information uniformly from any input modality the agent already accepts (text today; transcribed voice; extracted text from other media if added), with no difference in fidelity between modalities.
- **FR-006**: The system MUST avoid ingesting information that is clearly sensitive (credentials, secrets, private tokens); when such content is detected, the system MUST either store a redacted summary or skip that item and inform the user.

#### Memory Retrieval (Query)

- **FR-007**: Before generating a response that could benefit from prior context, the system MUST retrieve relevant memory items for the current user and current topic and make them available to the model that drafts the reply.
- **FR-008**: Retrieval MUST combine text-matching, semantic similarity, and graph relationships so that items related by meaning or by linkage are surfaced even when the user's wording differs from the stored phrasing.
- **FR-009**: The system MUST enforce strict per-user isolation during retrieval; a query on behalf of one user identity MUST never return memory belonging to a different user identity — including when both users share the same channel, the same conversation room, or different channels.
- **FR-010**: The system MUST attribute recalled information in its replies when the user explicitly asks "how do you know that?" or "when did I tell you?" — identifying the approximate date and conversation topic.
- **FR-011**: The system MUST support an analytical retrieval mode for questions that require synthesis across many past items (e.g., "what decisions have I made about authentication?"), returning a structured summary rather than a single snippet.

#### Memory Maintenance (Lint / Consolidate)

- **FR-012**: The system MUST run a periodic consolidation process that merges duplicate items (same entity described with slightly different phrasing), infers transitive relationships where the relationship type supports it, and prunes items that are both stale (not referenced in a long time) and of low value (not a decision or Conversation Record).
- **FR-013**: The system MUST detect conflicting items (two stored facts about the same entity whose content materially disagrees) during consolidation and surface them for user review.
- **FR-014**: When the user makes a statement that supersedes a previously stored fact, the system MUST mark the older fact as historical with the supersession date rather than deleting it outright.
- **FR-015**: The system MUST never automatically prune Memory Items classified as explicit user decisions, nor any Conversation Record, regardless of age or access frequency.
- **FR-016**: The system MUST persist a user-viewable summary of each consolidation pass (e.g., "merged 3 duplicates, flagged 1 contradiction, pruned 12 stale items") and return it on explicit user request ("what changed in memory?", "show me the last consolidation"). Routine summaries MUST NOT be pushed to the user unprompted.
- **FR-016a**: Contradictions that require user resolution (per FR-013) are the sole exception to the pull-only rule: when unresolved contradictions exist, Sirimath MUST surface them proactively at the start of the user's next conversation and ask which version is correct.

#### User Control

- **FR-017**: Users MUST be able to ask Sirimath to forget a specific fact, entity, or conversation, and receive confirmation that the deletion succeeded.
- **FR-018**: Users MUST be able to ask "what do you remember about me?" and receive a concise, human-readable summary of their stored profile.
- **FR-019**: Users MUST be able to request a full export of their remembered data for review or for transfer, returned in a plain-text human-readable format.
- **FR-020**: Users MUST be able to request complete erasure of all memory associated with their user identity, and receive confirmation that the erasure completed.
- **FR-020a**: Every user-control operation (FR-017–020) MUST be invocable through natural-language intent ("forget that I use Stripe", "what do you remember about me?", "export my memory", "erase everything you know about me"). Natural-language dispatch is the primary, channel-agnostic surface.
- **FR-020b**: The system MUST additionally expose a small set of explicit commands (e.g., `/forget`, `/memory`, `/export`, `/erase`) as an unambiguous fallback for destructive operations. Explicit commands MUST be available on any channel whose native UX supports command-style invocation; on channels that do not, the natural-language surface alone is sufficient.
- **FR-020c**: Destructive operations (single-item forget, full erase) MUST require an explicit user confirmation step before executing, regardless of whether they were invoked via natural language or via an explicit command.

#### System Behavior

- **FR-021**: Memory storage MUST persist across process restarts, server migrations, and temporary backend outages, with no silent data loss on normal crashes.
- **FR-022**: The presence or absence of memory MUST NOT cause Sirimath to fail to respond; if memory retrieval fails, the assistant MUST still answer using just the current conversation context and warn the user that memory is temporarily unavailable.
- **FR-023**: Adding memory extraction and retrieval MUST NOT increase the perceived response latency for a typical message by more than a small, user-noticed margin (see Success Criterion SC-004).
- **FR-024**: The system MUST operate without requiring any additional paid external service beyond the LLM provider already configured for Sirimath; memory extraction, embedding, retrieval, and consolidation MUST all be possible in a zero-extra-cost configuration. Richer extraction via a separate LLM MAY be offered as an optional upgrade.

#### Channel Independence (Generic Design)

- **FR-025**: The memory subsystem MUST be channel-agnostic. It MUST NOT depend on any specific channel's APIs, data models, or identifier formats (no assumption that a user identity is a Telegram user id, a Discord snowflake, a Slack member id, etc.).
- **FR-026**: The memory subsystem MUST identify users by a stable internal user identity that any channel integration can map to from its own native identifiers. The mapping is the channel integration's responsibility; the memory subsystem only consumes the already-resolved identity.
- **FR-027**: Adding a new channel to Sirimath in the future MUST NOT require schema changes, migrations, or code changes inside the memory subsystem — only the new channel's user-identity mapping needs to be configured.
- **FR-028**: The memory subsystem MUST allow a user to optionally link two channel-specific identities as the same internal User Identity, so that a person reaching Sirimath via multiple channels can share one memory store if they choose. Linking MUST be explicit and user-initiated; it MUST NOT happen automatically based on inferred signals such as display name or avatar.
- **FR-028a**: Cross-channel identity linking MUST use a pairing-code flow: from an already-linked channel, the user requests a link; the system issues a short-lived, single-use pairing code (bound to the requesting User Identity); the user then sends the same code from the new channel within the validity window; the system verifies the code and records the new channel identity under the same internal User Identity. Expired or already-consumed codes MUST be rejected.
- **FR-028b**: A pairing code MUST NOT, on its own, grant access to memory content. The code's sole effect is to register a new channel identity under the existing User Identity; memory access continues to be gated by the per-user isolation rule (FR-009). Failed or abandoned pairing attempts MUST NOT leak whether a given User Identity exists.
- **FR-029**: All user-control operations (view, export, forget a single item, erase all memory) MUST be available through any channel Sirimath supports, not only through one privileged channel.

### Key Entities _(include if feature involves data)_

- **User Identity**: A stable, channel-independent identifier under which all of a user's memory is anchored. Each channel integration maps its native identifier (e.g., Telegram user id, Discord user id, CLI username) to this identity. The identity serves as the sole isolation boundary for retrieval.
- **Channel Identity Mapping**: A record linking an external channel's native user identifier to an internal User Identity. Multiple channel identities MAY optionally be mapped to the same internal User Identity.
- **User Profile**: A per-User-Identity record holding that user's preferences, display name, communication style, and any other durable profile attributes.
- **Memory Item**: A single atomic unit of remembered knowledge. Has a type (entity, concept, decision, preference, event), a short natural-language description, a link to the source Conversation Record and timestamp, validity dates (when the fact became true and when it ceased), and access statistics (how often it has been referenced). Memory Items do NOT hold conversation transcripts — those live in Conversation Records.
- **Relationship**: A directed, named link between two memory items (e.g., "uses", "depends_on", "decided_to", "supersedes", "part_of"). Carries a confidence weight, a natural-language description, and a timestamp.
- **Conversation Record**: A stored record of a single user–assistant conversation. Holds the full turn-by-turn transcript (or a faithful summary where transcript retention is impractical), the User Identity of the speaker, the start/end timestamps, and the channel on which the conversation occurred (informational — never used for isolation). Conversation Records are the referential source for any Memory Item extracted from that conversation: each Memory Item links back to exactly one Conversation Record via FR-003. Conversation Records are never automatically pruned (FR-015).
- **Consolidation Report**: An append-only record of each maintenance pass — what was merged, pruned, inferred, or flagged as conflicting — so users can audit changes over time.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In a blind evaluation across 20 simulated user sessions spanning at least three days of simulated time each, Sirimath recalls at least **90%** of facts the user explicitly stated in earlier sessions when the user asks a question that clearly depends on one of those facts.
- **SC-002**: When the user asks a synthesis question that requires combining information from three or more prior conversations, Sirimath produces an answer that correctly references at least **80%** of the relevant prior items — verified against the ground-truth set used to seed the sessions.
- **SC-003**: Memory is strictly isolated per user identity: in a red-team test where a second user intentionally tries to phrase questions to leak the first user's information (including attempts using the same channel, a shared room, and a different channel), Sirimath reveals **zero** cross-user data across 100 probe attempts.
- **SC-004**: Adding memory retrieval to a turn increases the user-perceived response time by no more than **1 second** on average, measured across a representative sample of 100 messages using the default zero-extra-cost configuration.
- **SC-005**: After running the consolidation process on a memory store seeded with 50 known-duplicate items and 10 known stale items, at least **95%** of duplicates are correctly merged and at least **90%** of stale items are correctly pruned, with no explicit decision or Conversation Record being pruned.
- **SC-006**: When the user requests "what do you remember about me?", Sirimath returns a readable summary in under **5 seconds** for a memory store of up to 10,000 items.
- **SC-007**: When the user requests full erasure of their memory, the erasure completes and is verifiable (a follow-up "what do you remember about me?" returns "nothing") within **30 seconds**.
- **SC-008**: Across a one-month pilot with the operator as the primary user (plus optionally 1–2 additional trusted users invited for isolation testing), the primary user reports that Sirimath "feels like it remembers me" at a rating of **4 out of 5 or higher** on a 5-point scale on a weekly self-assessment.
- **SC-009**: When a second input/output channel is introduced to Sirimath, adding it requires **zero changes** to the memory subsystem's schema, code, or data — only a new channel-identity mapping entry. Verified by a dry-run integration test that connects a second simulated channel without touching memory code.

---

## Assumptions

- **Deployment scale is single-user**: Sirimath is deployed as a personal assistant for a single operator; one User Identity is the expected steady state. Per-user isolation (FR-009) is nevertheless a hard requirement because (a) multi-speaker rooms are still supported for isolation under that single operator's instance, and (b) the isolation boundary must remain intact to allow a low-friction future promotion to a small trusted group without reworking the memory subsystem.
- **Default scope is single-user-per-conversation**: Sirimath's interaction pattern is assumed to be one person per conversation context by default (DM-style). Multi-user rooms are supported for isolation (each speaker's memory is separate) but shared "group memory" (memory written on behalf of the room rather than a specific person) is out of scope for this spec.
- **Memory lives server-side**: The user's remembered data resides on the same host that runs Sirimath. The user has no expectation that memory syncs to any client; memory persists where the agent persists.
- **Default configuration requires no new API keys**: A zero-extra-cost mode of memory (using the LLM provider already configured and locally computed representations for similarity) is the default. A higher-quality mode that calls an external extraction/embedding service is an optional upgrade the operator may enable.
- **Retention window for stale pruning**: 90 days since last access is the default threshold for considering a non-decision, non-Conversation Record item "stale". Operators may tune this.
- **Consolidation cadence**: The automatic consolidation pass runs on a schedule (e.g., daily) and on an explicit user request. Exact cadence is an operator-configurable detail.
- **Language**: User conversations are assumed to be in English or a language the configured LLM handles well; memory quality for other languages depends on the model's capability.
- **Channel-agnostic integration surface**: The memory subsystem is consumed by the agent core, which in turn is reachable from any channel adapter. The feature is designed against the agent-core surface, not against any specific channel adapter. The current Telegram channel is one consumer among many that may exist over time.
- **Existing agent platform is retained**: This feature integrates into Sirimath's existing agent loop, pluggable LLM provider system, and short-term conversation-history store; it does not replace any of them. The existing in-session conversation history continues to serve short-term recall; the new memory layer is specifically for cross-session, compounding knowledge.

---

## Out of Scope

- Shared "group memory" for multi-user rooms (where a fact is remembered on behalf of a room rather than a specific user). Per-speaker memory in multi-user rooms IS in scope; shared room memory is not.
- A standalone UI outside of any chat channel for browsing or editing memory. Export-to-file and in-chat commands on any supported channel are the supported interfaces for manual review.
- Automatic ingestion of content the user has not sent to Sirimath (e.g., scraping the user's email, calendar, or external documents).
- Vector database infrastructure requiring separate operational deployment; the default memory backend must be operable by a single operator without provisioning new services.
- Fine-tuning or training model weights based on remembered content. "Self-improving" here refers to the memory structure compounding and consolidating, not the underlying LLM being retrained.
- Automatic cross-channel identity linking based on inferred signals such as matching display names, avatars, or phone numbers. Linking is always explicit.

---

## Dependencies

- Sirimath's existing agent loop, pluggable LLM provider system, and channel abstractions must be functioning. The feature consumes their outputs and extends the agent's capabilities; it does not replace them. The feature assumes the agent core exposes (or can be extended to expose) a resolved `user_identity` on every turn, independent of which channel that turn arrived on.
- The configured LLM provider must be capable enough to (a) extract structured items from conversation turns and (b) make use of retrieved memory items as context when drafting replies. The assistant's answer quality with retrieved memory is bounded by the model's capability.
