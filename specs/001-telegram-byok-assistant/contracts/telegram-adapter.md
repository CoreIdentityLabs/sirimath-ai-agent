# Contract: Telegram Channel Adapter

**Module**: `src/channels/telegram.ts`  
**Type**: Internal module interface  
**Date**: 2026-03-16

---

## Purpose

Translates between the Telegram Bot API protocol and VoltAgent agent invocations. This module is the sole point of contact with Telegram — no other module imports `grammy` or handles Telegram-specific types.

## Exported Interface

### `startTelegramBot(agent, logger): Promise<void>`

Initializes and starts the Telegram bot. The function:

1. Reads `TELEGRAM_BOT_TOKEN` from environment (exits with error if missing).
2. Creates a `grammy.Bot` instance.
3. Registers message handlers that delegate to `agent.generateText()`.
4. Starts the bot in the mode specified by `TELEGRAM_MODE` (`polling` or `webhook`).

**Signature**:

```typescript
import type { Agent } from "@voltagent/core";
import type { Logger } from "@voltagent/logger";

export async function startTelegramBot(
  agent: Agent,
  logger: Logger,
): Promise<void>;
```

**Parameters**:

| Param    | Type                                | Description                                          |
| -------- | ----------------------------------- | ---------------------------------------------------- |
| `agent`  | `Agent` (from `@voltagent/core`)    | Fully configured agent with tools, memory, and model |
| `logger` | `Logger` (from `@voltagent/logger`) | Structured logger for Telegram adapter events        |

**Returns**: `Promise<void>` — resolves after bot is started (long-polling) or initialized (webhook).

**Side Effects**:

- Starts a long-polling loop or registers a webhook route
- Sends Telegram API requests (replies to users)

**Error Behavior**:

- Missing `TELEGRAM_BOT_TOKEN` → logs error + `process.exit(1)`
- grammy runtime errors → caught by `bot.catch()`, logged, user receives friendly error
- `agent.generateText()` errors → caught in handler, user receives "Something went wrong" message

---

## Message Flow

```
Telegram User
    │
    ▼ (text message)
grammy Bot.on("message:text")
    │
    ├─ Access control check (ALLOWED_TELEGRAM_USER_IDS)
    │   └─ Denied → reply "access denied"
    │
    ├─ Extract userId (ctx.from.id) + conversationId (ctx.chat.id)
    │
    ▼
agent.generateText(text, { userId, conversationId })
    │
    ▼ (response text)
splitMessage(response, 4096)
    │
    ▼
ctx.reply(chunk) × N
```

## Non-Text Message Handling

Any message without a `text` field (photos, voice, documents, stickers, etc.) receives a static reply:

```
I currently support text messages only. Please send me a text message.
```

## Access Control

When `ALLOWED_TELEGRAM_USER_IDS` is set (comma-separated numeric IDs):

- Parse into a `Set<string>` at startup
- Check `ctx.from.id.toString()` against the set before processing
- Unauthorized users receive: "Sorry, you don't have access to this assistant."

When not set: all users are allowed (open mode).

---

## Configuration

| Env Var                     | Required   | Default   | Values               |
| --------------------------- | ---------- | --------- | -------------------- |
| `TELEGRAM_BOT_TOKEN`        | Yes        | —         | BotFather token      |
| `TELEGRAM_MODE`             | No         | `polling` | `polling`, `webhook` |
| `TELEGRAM_WEBHOOK_URL`      | If webhook | —         | Full HTTPS URL       |
| `ALLOWED_TELEGRAM_USER_IDS` | No         | —         | Comma-separated IDs  |
