# Research: Telegram BYOK Personal Assistant with Skill Discovery

**Feature Branch**: `001-telegram-byok-assistant`  
**Date**: 2026-03-16

---

## R1: Telegram Bot Integration with grammy

### Decision: Use `grammy` v1.x with long-polling (default) and optional webhook mode

### Rationale

- `grammy` is the TypeScript-first Telegram Bot API framework, actively maintained, with strong typing out of the box.
- It supports both **long-polling** (`bot.start()`) for local dev and **webhook** mode (`bot.init()` + `webhookCallback()`) for production — matching FR-004.
- The `Bot` class provides a clean `bot.on("message:text", handler)` API for handling text messages.
- grammy has a lightweight core (~50KB) and modular plugin system (sessions, menus, conversations) — but for this feature we only need the core.
- Alternative: `telegraf` — larger community but weaker TypeScript support; `node-telegram-bot-api` — very low-level, no built-in webhook support.

### Alternatives Considered

| Library                 | TypeScript                     | Ecosystem              | Webhook                      | Decision                |
| ----------------------- | ------------------------------ | ---------------------- | ---------------------------- | ----------------------- |
| `grammy`                | Native TS, full type inference | Modular plugins        | Built-in `webhookCallback()` | **Chosen**              |
| `telegraf`              | TS via `@types`, some gaps     | Large plugin ecosystem | Built-in webhook             | Rejected: weaker types  |
| `node-telegram-bot-api` | Via `@types` only              | Minimal                | Manual setup                 | Rejected: too low-level |

### Key API Surface

```typescript
import { Bot } from "grammy";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// Handle text messages
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id.toString();
  const text = ctx.message.text;

  // Call VoltAgent agent
  const result = await agent.generateText(text, {
    userId,
    conversationId: chatId,
  });

  // Reply (handle message splitting if > 4096 chars)
  await ctx.reply(result.text);
});

// Non-text messages
bot.on("message", async (ctx) => {
  if (!ctx.message?.text) {
    await ctx.reply("I currently support text messages only.");
  }
});

// Long-polling mode
bot.start();

// Webhook mode (for production with Hono)
// bot.init();
// app.post("/telegram/webhook", webhookCallback(bot, "hono"));
```

### Message Splitting

Telegram limits messages to 4096 characters. Strategy:

- Split on paragraph boundaries (`\n\n`) first, then on line boundaries (`\n`), then on word boundaries.
- Send each chunk sequentially with a ~100ms delay to preserve order.

### Error Handling

grammy's `bot.catch()` provides a global error handler. LLM errors (rate limits, auth failures) should be caught in the message handler and translated to user-friendly messages.

---

## R2: BYOK Multi-Provider Resolution via Vercel AI SDK

### Decision: Dynamic provider factory function `resolveModel()` that reads `MODEL_PROVIDER` + `MODEL_ID` env vars at startup

### Rationale

- VoltAgent's `Agent` accepts any Vercel AI SDK `LanguageModel` in its `model` field.
- Each provider has its own `@ai-sdk/*` package with a factory function (e.g., `openai("gpt-4o-mini")`, `anthropic("claude-sonnet-4-20250514")`).
- A simple switch/map on `MODEL_PROVIDER` → import the corresponding factory → call it with `MODEL_ID` is the cleanest approach.
- Dynamic `import()` can be used so only the configured provider package is loaded at runtime (avoids requiring all provider packages to be installed).
- Alternative: Registry pattern from `@voltagent/core`'s `ModelProviderRegistry` — adds complexity for no gain in a single-agent setup.

### Alternatives Considered

| Approach                                       | Complexity | Flexibility                                       | Decision                                                                               |
| ---------------------------------------------- | ---------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Switch/map with dynamic import                 | Low        | High — add providers by adding cases              | **Chosen**                                                                             |
| `ModelProviderRegistry`                        | Medium     | Slightly more structured                          | Rejected: YAGNI for single agent                                                       |
| String model ID (e.g., `"openai/gpt-4o-mini"`) | Very low   | Limited — VoltAgent may not resolve all providers | Rejected: VoltAgent uses string model IDs internally but we need explicit Azure config |

### Provider Resolution Logic

```typescript
// src/config/model-provider.ts
import type { LanguageModel } from "ai";
import { createPinoLogger } from "@voltagent/logger";

const logger = createPinoLogger({ name: "model-provider" });

const SUPPORTED_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "azure",
  "groq",
  "mistral",
  "ollama",
] as const;

type ProviderName = (typeof SUPPORTED_PROVIDERS)[number];

export async function resolveModel(): Promise<LanguageModel> {
  const provider = (process.env.MODEL_PROVIDER || "openai") as ProviderName;
  const modelId = process.env.MODEL_ID || "gpt-4o-mini";

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    logger.error(
      { provider, supported: SUPPORTED_PROVIDERS },
      `Unsupported MODEL_PROVIDER "${provider}". Supported: ${SUPPORTED_PROVIDERS.join(", ")}`,
    );
    process.exit(1);
  }

  switch (provider) {
    case "openai": {
      const { openai } = await import("@ai-sdk/openai");
      return openai(modelId);
    }
    case "anthropic": {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(modelId);
    }
    case "google": {
      const { google } = await import("@ai-sdk/google");
      return google(modelId);
    }
    case "azure": {
      const { azure } = await import("@ai-sdk/azure");
      const resourceName = process.env.AZURE_RESOURCE_NAME;
      if (!resourceName) {
        logger.error(
          "AZURE_RESOURCE_NAME is required when MODEL_PROVIDER=azure",
        );
        process.exit(1);
      }
      // @ai-sdk/azure reads AZURE_API_KEY and AZURE_RESOURCE_NAME from env
      return azure(modelId);
    }
    case "groq": {
      const { groq } = await import("@ai-sdk/groq");
      return groq(modelId);
    }
    case "mistral": {
      const { mistral } = await import("@ai-sdk/mistral");
      return mistral(modelId);
    }
    case "ollama": {
      const { ollama } = await import("ollama-ai-provider-v2");
      return ollama(modelId);
    }
  }
}
```

### Environment Variables per Provider

| Provider    | Required Env Vars                                   |
| ----------- | --------------------------------------------------- |
| `openai`    | `OPENAI_API_KEY`                                    |
| `anthropic` | `ANTHROPIC_API_KEY`                                 |
| `google`    | `GOOGLE_GENERATIVE_AI_API_KEY`                      |
| `azure`     | `AZURE_API_KEY`, `AZURE_RESOURCE_NAME`              |
| `groq`      | `GROQ_API_KEY`                                      |
| `mistral`   | `MISTRAL_API_KEY`                                   |
| `ollama`    | (none — local server at `OLLAMA_BASE_URL` optional) |

---

## R3: Azure AI Foundry Integration

### Decision: Use `@ai-sdk/azure` package which provides the `azure()` factory function

### Rationale

- `@ai-sdk/azure` is the official Vercel AI SDK provider for Azure OpenAI Service (Azure AI Foundry).
- It reads `AZURE_API_KEY` and `AZURE_RESOURCE_NAME` from environment variables automatically.
- The `MODEL_ID` corresponds to the Azure deployment name (e.g., `gpt-4o`).
- The endpoint is constructed as `https://{resourceName}.openai.azure.com/openai/deployments/{modelId}`.
- No special VoltAgent configuration needed — Azure models behave identically to any other AI SDK provider.

### Alternatives Considered

| Approach                                        | Decision                                       |
| ----------------------------------------------- | ---------------------------------------------- |
| `@ai-sdk/azure` (official)                      | **Chosen** — first-party, auto-config from env |
| `@ai-sdk/openai-compatible` with Azure endpoint | Rejected: more config, less type safety        |
| Direct Azure REST API calls                     | Rejected: reinventing the wheel                |

### Configuration Example

```bash
MODEL_PROVIDER=azure
MODEL_ID=gpt-4o              # Azure deployment name
AZURE_RESOURCE_NAME=my-resource
AZURE_API_KEY=sk-...
```

---

## R4: Skills System (find-skills / install-skill Tools)

### Decision: Implement `findSkills` and `installSkill` as VoltAgent `createTool` tools, adapting the find-skills SKILL.md protocol into agent-callable tools

### Rationale

- The existing `skills/find-skills/SKILL.md` documents a protocol for searching `https://skills.sh/api/search`, fetching audit data from `https://skills.sh/audits`, and installing via `learn_skill`.
- In a VoltAgent context, we implement this as two tools:
  1. `findSkills` — takes a search query, calls the skills.sh API, fetches audit scores, returns formatted results.
  2. `installSkill` — takes a skill ID + source, fetches SKILL.md from GitHub, validates, and saves to the local skills directory.
- The agent's instructions will guide it to present results with security scores and request user confirmation before installing.
- Installation target: `./skills/` directory in the project root (persisted across restarts).

### Alternatives Considered

| Approach                                           | Decision                                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Two separate tools (`findSkills` + `installSkill`) | **Chosen** — clean separation of concerns, agent decides when to call each                         |
| Single combined tool with mode parameter           | Rejected: violates single-responsibility, harder for LLM to reason about                           |
| Workflow (multi-step with suspend/resume)          | Rejected: overkill; the agent's natural conversation flow handles the confirm-then-install pattern |

### skills.sh API Contract

**Search endpoint**: `GET https://skills.sh/api/search?q={query}`

Response:

```json
{
  "skills": [
    {
      "id": "owner/repo/skill-name",
      "skillId": "skill-name",
      "name": "skill-name",
      "installs": 174847,
      "source": "owner/repo"
    }
  ]
}
```

**Audit endpoint**: `GET https://skills.sh/audits` → Returns markdown with security scores per skill.

**SKILL.md fetch**: `GET https://raw.githubusercontent.com/{source}/main/{skillId}/SKILL.md`

### Tool Schemas

```typescript
// findSkills input
z.object({
  query: z
    .string()
    .describe(
      "Search query for skills (e.g., 'react', 'code review', 'email')",
    ),
});

// findSkills output: formatted string with skill table + security scores

// installSkill input
z.object({
  skillId: z.string().describe("The skill ID to install"),
  source: z.string().describe("The source repository (owner/repo)"),
  name: z.string().describe("The skill display name"),
});
```

### Installation Flow

1. Fetch `https://raw.githubusercontent.com/{source}/main/{skillId}/SKILL.md` (try `main`, then `master`).
2. Validate: non-empty, contains meaningful content (not HTML error page).
3. Parse frontmatter for `name` and `description`.
4. Save to `./skills/{skillId}/SKILL.md` and create `_meta.json` with metadata.
5. Return success message with installed skill details.

---

## R5: Telegram Channel Adapter Architecture

### Decision: Single file `src/channels/telegram.ts` that exports a `startTelegramBot(agent, logger)` function

### Rationale

- FR-012 requires the Telegram adapter to contain NO agent logic, LLM configuration, or tool definitions.
- The adapter receives the fully configured `Agent` instance and a logger, creates a grammy `Bot`, wires up message handlers, and starts polling or webhook mode.
- The adapter exports a single function — no classes, no interfaces. This is the simplest design that satisfies the requirement.
- For webhook mode, the function can accept a Hono `app` instance to register the webhook route on the existing server.

### Key Design Decisions

1. **User ID mapping**: Telegram `ctx.from.id` (number) → `userId` (string). Chat `ctx.chat.id` → `conversationId`.
2. **Access control**: If `ALLOWED_TELEGRAM_USER_IDS` is set, check `ctx.from.id` against the allowlist before processing.
3. **Message splitting**: Helper function `splitMessage(text: string, maxLen: number): string[]` inside the adapter file.
4. **Error boundary**: Wrap `agent.generateText()` in try/catch; translate known error types to user-friendly messages.
5. **Non-text messages**: `bot.on("message")` catches all messages; if no text, reply with "text only" notice (FR-014).

---

## R6: Conversation Memory Scoping

### Decision: Use existing LibSQL Memory adapter with `userId = telegram_user_id` and `conversationId = telegram_chat_id`

### Rationale

- The existing `Memory` instance with `LibSQLMemoryAdapter` already handles conversation storage.
- VoltAgent's `agent.generateText()` accepts `userId` and `conversationId` options, which automatically scope memory.
- No new memory configuration needed — the existing setup at `file:./.voltagent/memory.db` persists across restarts.
- Telegram user IDs are globally unique numbers, suitable as `userId`.
- Telegram chat IDs uniquely identify a conversation (private chat = same as user ID; group chats = distinct).

---

## R7: index.ts Modifications

### Decision: Modify existing `src/index.ts` to use dynamic model resolution and start the Telegram bot

### Rationale

- The current `index.ts` hardcodes `model: "openai/gpt-4o-mini"` — this must be replaced with the resolved model.
- The agent's `tools` array must include the new skill tools alongside the existing weather tool.
- After the `VoltAgent` bootstrap, call `startTelegramBot()` to begin listening for Telegram messages.
- The `agent` instance must be exported or passed to the Telegram adapter.

### Code Change Overview

```typescript
// Before:
const agent = new Agent({
  model: "openai/gpt-4o-mini",
  tools: [],
  // ...
});

// After:
import { resolveModel } from "./config/model-provider";
import { weatherTool, findSkillsTool, installSkillTool } from "./tools";
import { startTelegramBot } from "./channels/telegram";

const model = await resolveModel();

const agent = new Agent({
  model,
  tools: [weatherTool, findSkillsTool, installSkillTool],
  // ...
});

// ... VoltAgent bootstrap ...

// Start Telegram bot
startTelegramBot(agent, logger);
```

---

## Implementation Learnings

> These sections document corrections and discoveries made during actual implementation. They take precedence over the original design notes above where they conflict.

---

## L1: Azure Reasoning Models — Must Use Chat Completions API, Not Responses API

### Problem Discovered

When using Azure-hosted reasoning models (`o1`, `o3`, `gpt-5.x`), the `@ai-sdk/azure` package defaults to the **OpenAI Responses API** (`/openai/v1/responses`). This API caches `reasoning` tokens (`rs_…` item IDs) server-side. On subsequent turns, Azure requires those reasoning tokens to be present alongside any `function_call` items that reference them.

VoltAgent's memory system (LibSQL) stores and reconstructs conversation history independently — it includes `function_call` items but **omits the server-side reasoning tokens**, causing Azure to return:

```
HTTP 400: Item 'fc_...' of type 'function_call' was provided without its required 'reasoning' item
```

### Fix

Always use `azureProvider.chat(modelId)` (explicit Chat Completions API) instead of `azureProvider(modelId)` (default, which routes reasoning models to Responses API):

```typescript
// ❌ Wrong — uses Responses API for reasoning models
return azureProvider(modelId);

// ✅ Correct — always uses Chat Completions API (stateless, no server-side reasoning state)
return azureProvider.chat(modelId);
```

### Rule for Future Agents

Whenever an `@ai-sdk/azure` model is used with any memory or conversation-history system, always call `.chat()` explicitly. The default `azureProvider(modelId)` callable is unsafe for multi-turn conversations with reasoning models.

---

## L2: skills.sh API — Actual Response Shape Differs from Spec

### Problem Discovered

The original spec assumed the `/audits` endpoint returns markdown with security scores, and that the search API returns `slug` and `publisher` fields. In reality:

- `/audits` returns a **Next.js server-rendered HTML page** — no parseable JSON or markdown. No public audit JSON API exists.
- The search API response shape is:

```json
{
  "query": "pdf",
  "skills": [
    {
      "id": "owner/repo/skillId",
      "skillId": "pdf-reader",
      "name": "pdf-reader",
      "installs": 39474,
      "source": "anthropics/skills"
    }
  ],
  "count": 100,
  "duration_ms": 40
}
```

Fields `slug` and `publisher` do not exist. The correct fields are `skillId` and `source`.

### Fix

- Remove all audit fetching logic. Security scores are unavailable via public API; show `⚠️ Unknown` for all skills or omit the column.
- Map `data.skills` (not `data.results`) and use `skill.skillId` and `skill.source` (not `skill.slug` / `skill.publisher`).
- Cap results at 15 to keep the LLM context manageable.
- Include a numbered "Install reference" block at the end of results output so the agent can pass exact `skillId` and `source` values to `installSkill` without guessing from truncated table display values.

### Rule for Future Agents

When calling `https://skills.sh/api/search?q={query}`, the response array is at `data.skills`, each element has `{ skillId, source, name, installs }`. Do not attempt to fetch or parse `https://skills.sh/audits`.

---

## L3: SKILL.md GitHub URL — `skills/` Subdirectory Prefix Required

### Problem Discovered

The spec documents the SKILL.md fetch URL as:

```
https://raw.githubusercontent.com/{source}/main/{skillId}/SKILL.md
```

This path **does not exist** in the vast majority of skill repositories. The correct path is:

```
https://raw.githubusercontent.com/{source}/main/skills/{skillId}/SKILL.md
```

Skills live in a `skills/` subdirectory within the repo, not at the repo root.

Additional edge case: some repos (e.g. `vercel-labs/agent-skills`) use a namespaced `skillId` in the skills.sh registry (e.g. `vercel-react-best-practices`) that differs from the actual directory name (`react-best-practices`). The skills.sh registry prepends the repo/owner as a namespace prefix.

### Fix

Implement a three-step URL resolution with fallback:

1. Try `skills/{skillId}/SKILL.md` (most repos)
2. Try `{skillId}/SKILL.md` (uncommon flat layout)
3. Fall back to GitHub Contents API: list the `skills/` directory and fuzzy-match the `skillId` against directory names (handles namespace prefix edge cases)

Try both `main` and `master` branches in each step.

### Rule for Future Agents

Always try `skills/{skillId}/SKILL.md` first. Never assume SKILL.md is at the repo root. Always implement a GitHub Contents API fallback for namespace-prefixed skillIds.

---

## L4: Installed Skills Are Markdown Definitions Only — Agent Needs Real Tools for Internet Access

### Problem Discovered

Skills installed via `installSkill` are saved as `./skills/{skillId}/SKILL.md` files. These files contain **instructions for running CLI tools** (e.g., `parallel-cli search`, `puppeteer` commands). The VoltAgent runtime does not execute shell commands or external binaries — it can only call registered `createTool` functions.

When skill files reference tools like `parallel-cli` or browser automation, the agent correctly recognises the skill but cannot act on it, leading to responses like:

> "Even though ✅ `agent-browser` is installed, this environment does not allow external network execution."

### Fix

Provide the agent with first-party HTTP tools that cover the most common skill use cases:

| Tool | Purpose | External dependency |
|---|---|---|
| `fetchUrl` | HTTP GET any URL, returns body | None (Node.js `fetch`) |
| `webSearch` | Web search via Brave or Tavily API | `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY` |
| `getWeather` | Real weather via open-meteo.com | None (free, no API key) |

The `webSearch` tool is registered only when at least one search API key is present in the environment.

### Rule for Future Agents

Do not rely on installed skills to provide executable capabilities. Skills are prompt-level instructions only. Any capability the agent must execute — web search, HTTP fetch, browser automation — requires a corresponding `createTool` implementation registered in the agent's `tools` array.

---

## L5: Weather Tool — Use open-meteo.com, Not Mock Data

### Problem Discovered

The initial `weatherTool` implementation used randomly-generated mock data. This was always a placeholder, but it was left in the implementation, causing the agent to return nonsense weather values.

### Fix

Replace with a two-step real implementation:

1. **Geocode**: `GET https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1` → returns `{ latitude, longitude, country }`
2. **Forecast**: `GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weathercode` → returns current conditions

Both endpoints are free and require no API key. WMO weather code → human-readable condition mapping must be maintained in the tool code.

### Rule for Future Agents

Use open-meteo.com for weather. Geocoding endpoint: `https://geocoding-api.open-meteo.com/v1/search`. Forecast endpoint: `https://api.open-meteo.com/v1/forecast`. No API key needed. Always decode WMO `weathercode` to a human-readable string.

---

## L6: ollama-ai-provider-v2 Version Pinning — zod Peer Dependency Conflict

### Problem Discovered

`ollama-ai-provider-v2` latest version (3.x) requires `zod ^4`, but the VoltAgent ecosystem uses `zod ^3`. Installing the latest version causes peer dependency conflicts that break the build.

### Fix

Pin to `ollama-ai-provider-v2@1.5.5` and install with `--legacy-peer-deps`:

```bash
npm install ollama-ai-provider-v2@1.5.5 --legacy-peer-deps
```

### Rule for Future Agents

When adding Ollama support to a VoltAgent project, always pin `ollama-ai-provider-v2` to `1.5.5`. Check `npm info ollama-ai-provider-v2 peerDependencies` before upgrading — upgrade only when the project's zod version is also upgraded to v4.

---

## L7: VoltAgent Logger API — Argument Order

### Problem Discovered

The `@voltagent/logger` / `@voltagent/internal` logger does not use pino's `(object, message)` argument order. The actual signature is:

```typescript
// ❌ Wrong (pino style)
logger.info({ userId, conversationId }, "Received message");

// ✅ Correct (VoltAgent style)
logger.info("Received message", { userId, conversationId });
```

Using the wrong order causes the message string to be treated as context and the context object to be stringified as the message.

### Rule for Future Agents

VoltAgent logger calls are always `logger.level(message: string, context?: object)`. Never use pino's `(object, message)` inverted form with VoltAgent loggers.
