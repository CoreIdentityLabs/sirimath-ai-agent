# Contract: Channel-Adapter Integration

**Feature**: `specs/004-self-improving-memory/spec.md`
**Purpose**: Every channel adapter (today `src/channels/telegram.ts`, tomorrow Slack / WhatsApp / CLI / voice-direct) MUST honor this contract. SC-009 is the compliance gate: adding a new channel MUST require zero changes inside `src/memory/`.

---

## Responsibilities split

| Concern | Lives in | Notes |
|---|---|---|
| Protocol framing (HTTP, Telegram long-poll, grammy, etc.) | `src/channels/<channel>.ts` | channel-specific |
| Access control (ALLOWED_TELEGRAM_USER_IDS, OAuth tokens, etc.) | `src/channels/<channel>.ts` | pre-resolution gate |
| User-identity resolution | `src/memory/identity.ts` via `IdentityStore.resolveOrCreate` | shared |
| Memory retrieval & extraction | `src/memory/` via `MemoryAwareAgent` façade | shared |
| Tool execution, LLM invocation | VoltAgent `Agent` | unchanged |
| User-control commands (NL + explicit) | LLM + memory tools | shared |
| Voice transcription | channel adapter's STT pipeline | channel-specific |

---

## Minimum required changes in a channel adapter

A channel adapter MUST, on every inbound user message:

1. **Apply access control** (channel-specific allowlists, rate limits).
2. **Resolve user identity** by calling:
   ```typescript
   const userIdentity = await identityStore.resolveOrCreate(CHANNEL_NAME, channelNativeUserId);
   ```
3. **Invoke the façade** instead of the raw agent:
   ```typescript
   const reply = await memoryAwareAgent.reply({
     userIdentity,
     conversationId,                          // channel-provided conversation id
     channel: CHANNEL_NAME,                   // lowercase label
     channelNativeId: channelNativeUserId,    // used only by pair-confirm tool
     text,
   });
   ```
4. **Map inbound explicit commands** (if the channel has command UX) to directives that the LLM turns into tool calls. Example for Telegram:
   ```typescript
   bot.command("memory", async (ctx) => {
     await memoryAwareAgent.reply({
       ...,
       text: "(system directive) the user invoked /memory — call the memoryViewProfile tool and return its result in plain prose.",
     });
   });
   ```
5. **Never import from `src/memory/store/` or touch the SQLite file directly** — only `src/memory/index.ts` exports are allowed.

---

## SC-009 acceptance: dry-run integration test

A new channel adapter `src/channels/dryrun.ts` is introduced for the acceptance test. It:

1. Reads stdin line by line as user messages.
2. Uses the string `"dryrun:<user>"` as its `channelNativeUserId`.
3. Writes agent replies to stdout.

The test script (invoked manually per quickstart) confirms:

- A session started on Telegram produces a `user_identity` and memory items.
- Starting `npm run dryrun` with the same `dryrun:alice` user produces a **different** `user_identity` (no automatic linking — FR-028, Out-of-Scope).
- After running `/memory link` on Telegram (gets a code) and `/memory link <code>` on the dryrun channel, the dryrun session sees the Telegram-originated memory items on the next turn (FR-028a, FR-028b).

Adding `dryrun.ts` requires exactly **zero** lines changed in `src/memory/`.

---

## Identity privacy boundary

- The memory subsystem never receives a Telegram user id, Discord snowflake, Slack member id, etc. except through `IdentityStore.resolveOrCreate` and `memory_pair_confirm`.
- `channel_identity_mapping` is the one table that holds native ids. It is accessed only by `identity.ts`.
- Structured logs (pino) MUST redact `channelNativeId` at the boundary: the memory subsystem logs the `userIdentity` only.

---

## Anti-patterns (forbidden)

| Anti-pattern | Why forbidden |
|---|---|
| Using `ctx.chat.id.toString()` as `userId` inside a memory tool | leaks a Telegram-specific type into the memory subsystem; breaks FR-025 |
| Calling `agent.generateText()` directly from a channel adapter | bypasses retrieval preamble and extraction hook; fails FR-007, FR-001 |
| Storing `userIdentity = telegramUserId` | the two must be distinct even in a single-user install, so a future Discord channel can map a different native id to the same internal identity |
| Exposing memory contents to the channel layer before the agent has authenticated the user | bypasses FR-009 isolation |

---

## Future channels: example

To add a Discord adapter later:

```typescript
// src/channels/discord.ts — new file, purely channel logic
bot.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!isAllowed(msg.author.id)) return;

  const userIdentity = await identityStore.resolveOrCreate("discord", msg.author.id);
  const reply = await memoryAwareAgent.reply({
    userIdentity,
    conversationId: msg.channelId,
    channel: "discord",
    channelNativeId: msg.author.id,
    text: msg.content,
  });
  await msg.reply(reply);
});
```

Zero lines change inside `src/memory/`. SC-009 satisfied.
