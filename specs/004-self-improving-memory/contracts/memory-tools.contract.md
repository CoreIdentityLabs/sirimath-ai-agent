# Contract: Memory Tools (LLM-callable surface)

**Feature**: `specs/004-self-improving-memory/spec.md`

All user-control operations MUST be invocable through both natural-language intent and explicit commands (FR-020a, FR-020b). The mechanism for both is the same: a set of `createTool`-registered tools the LLM calls. Natural-language dispatch is handled by the LLM (it picks the right tool based on user intent). Explicit slash commands in channel adapters translate to injecting a directive into the user message (or calling the tool directly via VoltAgent's tool execution API, if available).

Every tool below follows Principle III (Tool-Driven Extensibility):
- unique `name`
- human-readable `description`
- Zod `parameters` schema
- pure `execute` handler receiving a typed input, returning a typed output
- no direct DB access — each tool calls the `MemoryStore` / `IdentityStore` interface from [memory-service.contract.md](./memory-service.contract.md)

Tools receive the **resolved `userIdentity`** via the VoltAgent tool context (the façade injects it into the tool-call options before the agent runs). Tools MUST NOT trust any user-supplied identifier arguments for isolation — only the context-injected `userIdentity`.

---

## Tool: `memory_search`

**When the LLM invokes it**: the user references a past conversation, project, preference, or decision and deeper recall is needed than the auto-injected preamble.

```typescript
// src/memory/tools/memory-search.ts
import { createTool } from "@voltagent/core";
import { z } from "zod";

export const memorySearchTool = createTool({
  name: "memorySearch",
  description:
    "Search the user's long-term memory for items relevant to a topic. Use this when the user references something from earlier conversations that is not already visible in the current context.",
  parameters: z.object({
    query: z.string().min(2).describe("The topic or question to search memory for."),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  execute: async ({ query, limit }, { operationContext }) => {
    const userIdentity = operationContext.userId; // injected by façade
    const items = await memoryStore.retrieve(userIdentity, query, limit);
    return {
      items: items.map((i) => ({
        id: i.itemId,
        type: i.type,
        description: i.description,
        knownSince: i.validFrom.toISOString(),
        supersededAt: i.validUntil?.toISOString() ?? null,
      })),
    };
  },
});
```

**Output promise**: at most `limit` items, already attributed with their `knownSince` date so the LLM can answer FR-010 ("when did I tell you?").

---

## Tool: `memory_view_profile`  (FR-018)

```typescript
export const memoryViewProfileTool = createTool({
  name: "memoryViewProfile",
  description:
    'Return a concise summary of everything the system remembers about the current user. Use this when the user asks "what do you remember about me?" or a close paraphrase.',
  parameters: z.object({}),
  execute: async (_input, { operationContext }) => {
    return await memoryStore.viewProfile(operationContext.userId);
  },
});
```

---

## Tool: `memory_forget`  (FR-017, FR-020c)

```typescript
export const memoryForgetTool = createTool({
  name: "memoryForget",
  description:
    'Forget a specific remembered item by its id or by a topic phrase. Use when the user says "forget that I use Stripe" or similar. Always presents a confirmation prompt before executing.',
  parameters: z.object({
    itemId: z.string().optional(),
    topic: z.string().optional(),
    confirm: z.boolean().default(false).describe("Set true only AFTER the user has confirmed."),
  }).refine((v) => v.itemId || v.topic, { message: "Either itemId or topic is required." }),
  execute: async (input, { operationContext }) => {
    const userIdentity = operationContext.userId;
    if (!input.confirm) {
      // Return a confirmation prompt; LLM relays it to the user.
      const candidates = input.itemId
        ? [await memoryStore.attribute(userIdentity, input.itemId)]
        : (await memoryStore.retrieve(userIdentity, input.topic!, 3));
      return {
        pending: true,
        candidates,
        message:
          "Confirm deletion by calling memoryForget again with confirm=true and the chosen itemId.",
      };
    }
    if (!input.itemId) {
      return { error: "confirm=true requires a specific itemId." };
    }
    const { ok } = await memoryStore.forgetItem(userIdentity, input.itemId);
    return { ok, itemId: input.itemId };
  },
});
```

**Why two-call confirmation**: FR-020c requires explicit confirmation for destructive ops. Encoding the state machine inside the tool keeps it independent of any channel's confirmation UX.

---

## Tool: `memory_export`  (FR-019)

```typescript
export const memoryExportTool = createTool({
  name: "memoryExport",
  description:
    "Return the user's full remembered knowledge as a plain-text Markdown document they can keep.",
  parameters: z.object({}),
  execute: async (_input, { operationContext }) => {
    return { markdown: await memoryStore.exportAll(operationContext.userId) };
  },
});
```

---

## Tool: `memory_erase`  (FR-020, FR-020c)

```typescript
export const memoryEraseTool = createTool({
  name: "memoryErase",
  description:
    "Permanently erase ALL memory associated with the current user. Destructive. Always requires explicit confirmation.",
  parameters: z.object({
    confirm: z.boolean().default(false),
    confirmationPhrase: z.string().optional().describe('Exact phrase "erase my memory" to confirm.'),
  }),
  execute: async ({ confirm, confirmationPhrase }, { operationContext }) => {
    if (!confirm || confirmationPhrase?.trim().toLowerCase() !== "erase my memory") {
      return {
        pending: true,
        message:
          'This will delete everything the assistant remembers about you. Reply "erase my memory" to confirm, or say "cancel".',
      };
    }
    const counts = await memoryStore.eraseAll(operationContext.userId);
    return { ok: true, ...counts };
  },
});
```

---

## Tool: `memory_pair_start`  (FR-028, FR-028a)

```typescript
export const memoryPairStartTool = createTool({
  name: "memoryPairStart",
  description:
    "Generate a short-lived pairing code the user can type on another channel to merge that channel's identity with the current one.",
  parameters: z.object({}),
  execute: async (_input, { operationContext }) => {
    const { code, expiresAt } = await identityStore.issuePairingCode(
      operationContext.userId,
      operationContext.channel, // injected by façade
    );
    return {
      code,
      expiresAt: expiresAt.toISOString(),
      instructions: `On the new channel, send: "/memory link ${code}" within the next 10 minutes.`,
    };
  },
});
```

---

## Tool: `memory_pair_confirm`  (FR-028a, FR-028b)

```typescript
export const memoryPairConfirmTool = createTool({
  name: "memoryPairConfirm",
  description:
    "Redeem a pairing code received on another channel. Must be called from the NEW channel, not from the channel that issued the code.",
  parameters: z.object({
    code: z.string().regex(/^[A-Z0-9]{6}$/),
  }),
  execute: async ({ code }, { operationContext }) => {
    const result = await identityStore.consumePairingCode(
      operationContext.channel,
      operationContext.channelNativeId, // injected by façade
      code,
    );
    if (!result.ok) {
      // FR-028b: do not leak whether a given user identity exists
      return { ok: false, message: "That code is not valid. Please start a new pairing." };
    }
    return {
      ok: true,
      message: "Channels linked. Your memory on this channel now matches your other one.",
    };
  },
});
```

---

## Tool: `memory_consolidate`  (FR-012, FR-016)

```typescript
export const memoryConsolidateTool = createTool({
  name: "memoryConsolidate",
  description:
    "Run a memory-maintenance pass now: merge duplicates, flag contradictions, prune stale items. Also callable on schedule.",
  parameters: z.object({}),
  execute: async (_input, { operationContext }) => {
    const report = await consolidator.runOnce(operationContext.userId);
    return {
      summary: report.summary,
      merged: report.merged,
      pruned: report.pruned,
      supersessionsRecorded: report.supersessionsRecorded,
      contradictionsDetected: report.contradictionsDetected.length,
    };
  },
});
```

---

## Tool: `memory_changes`  (FR-016)

```typescript
export const memoryChangesTool = createTool({
  name: "memoryChanges",
  description:
    'Return a summary of the most recent consolidation passes. Use when the user asks "what changed in memory?".',
  parameters: z.object({
    limit: z.number().int().min(1).max(10).default(3),
  }),
  execute: async ({ limit }, { operationContext }) => {
    const reports = await memoryStore.listConsolidationReports(operationContext.userId, limit);
    return {
      reports: reports.map((r) => ({
        ranAt: r.ranAt.toISOString(),
        summary: r.summary,
        merged: r.merged,
        pruned: r.pruned,
      })),
    };
  },
});
```

---

## Explicit-command mapping (FR-020b)

| User-typed command on channel | Dispatches to tool |
|---|---|
| `/memory` | `memory_view_profile` |
| `/forget <topic>` | `memory_forget` (first call, returns candidates) |
| `/export` | `memory_export` |
| `/erase` | `memory_erase` (first call, returns confirmation) |
| `/memory link` | `memory_pair_start` |
| `/memory link <code>` | `memory_pair_confirm` |
| `/memory changes` | `memory_changes` |

The channel adapter does NOT implement the business logic — it injects an instruction into the LLM turn (e.g., *"The user invoked /erase. Call the memoryErase tool."*) or invokes the tool via VoltAgent's runtime API if available. This keeps the business logic single-sourced in the tool handlers (Principle V).

---

## `operationContext` injection contract

The façade is responsible for populating, on every turn:

```typescript
operationContext = {
  userId: string,            // resolved user_identity — NEVER the channel-native id
  conversationId: string,    // the channel-provided conversation id
  channel: string,           // lowercase channel name, e.g. "telegram"
  channelNativeId: string,   // the channel's native user id (ONLY used by memoryPairConfirm)
}
```

Tools MUST only read from `operationContext.userId` for isolation. The `channelNativeId` is purposely pair-tool-only — no other tool is allowed to read it.
