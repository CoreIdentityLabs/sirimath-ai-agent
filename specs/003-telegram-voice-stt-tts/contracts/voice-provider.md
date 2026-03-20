# Contract: Voice Provider Configuration

**Module**: `src/config/voice-provider.ts`  
**Type**: Internal module interface  
**Date**: 2026-03-20

---

## Purpose

Resolves the optional voice provider (STT + TTS) from environment variables at startup. Follows the same pattern as `src/config/model-provider.ts` (`resolveModel()`). Returns a configured `Voice` instance or `null` when voice features are disabled.

## Exported Interface

### `resolveVoiceProvider(logger): Promise<Voice | null>`

Reads `VOICE_PROVIDER` from the environment and initializes the corresponding voice provider instance. Returns `null` when voice features should be disabled (provider not set, unsupported, or misconfigured).

**Signature**:

```typescript
import type { Voice } from "@voltagent/core";
import type { Logger } from "@voltagent/logger";

export async function resolveVoiceProvider(
  logger: Logger,
): Promise<Voice | null>;
```

**Parameters**:

| Param    | Type                                | Description                                 |
| -------- | ----------------------------------- | ------------------------------------------- |
| `logger` | `Logger` (from `@voltagent/logger`) | Structured logger for voice provider events |

**Returns**: `Promise<Voice | null>` — Configured voice provider instance, or `null` if voice disabled.

**Side Effects**:

- Logs info/warn/error messages about voice provider configuration
- Dynamically imports `@voltagent/voice` package (only when voice is enabled)

**Error Behavior**:

- `VOICE_PROVIDER` not set → returns `null` (info log)
- `VOICE_PROVIDER` set to unsupported value → returns `null` (warn log listing supported providers)
- `VOICE_PROVIDER=openai` but `OPENAI_API_KEY` missing → returns `null` (error log)
- `VOICE_PROVIDER=azure` but `AZURE_API_KEY` or `AZURE_RESOURCE_NAME` missing → returns `null` (error log)
- **Does NOT call `process.exit()`** — voice is optional, failures degrade to text-only

---

## Environment Variable Contract

| Variable              | When Read                    | Behavior                                                                                            |
| --------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `VOICE_PROVIDER`      | At startup                   | `"openai"` → OpenAI voice; `"azure"` → Azure voice; empty/unset → disabled; other → disabled + warn |
| `OPENAI_API_KEY`      | When `VOICE_PROVIDER=openai` | Required for OpenAI voice; missing → disabled + error log                                           |
| `AZURE_API_KEY`       | When `VOICE_PROVIDER=azure`  | Required for Azure voice; missing → disabled + error log                                            |
| `AZURE_RESOURCE_NAME` | When `VOICE_PROVIDER=azure`  | Required for Azure voice; missing → disabled + error log                                            |
| `TTS_MODEL`           | When voice enabled           | Optional; default `"tts-1"` (or Azure deployment name)                                              |
| `TTS_VOICE`           | When voice enabled           | Optional; default `"alloy"`                                                                         |
| `STT_MODEL`           | When voice enabled           | Optional; default `"whisper-1"` (or Azure deployment name)                                          |

---

## Supported Providers

| Provider Name | Package / Module                                           | STT                  | TTS              |
| ------------- | ---------------------------------------------------------- | -------------------- | ---------------- |
| `openai`      | `@voltagent/voice` → `OpenAIVoiceProvider`                 | OpenAI Whisper API   | OpenAI TTS API   |
| `azure`       | `src/voice/azure-voice-provider.ts` → `AzureVoiceProvider` | Azure OpenAI Whisper | Azure OpenAI TTS |

---

## Contract: Updated Telegram Adapter

**Module**: `src/channels/telegram.ts`  
**Type**: Internal module interface  
**Date**: 2026-03-20

---

## Updated Exported Interface

### `startTelegramBot(agent, logger, voiceProvider?): Promise<void>`

The function gains an optional third parameter for voice processing. When a voice provider is supplied, the adapter registers handlers for voice notes and audio files. When omitted or `null`, the existing text-only behavior is preserved.

**Updated Signature**:

```typescript
import type { Agent, Voice } from "@voltagent/core";
import type { Logger } from "@voltagent/logger";

export async function startTelegramBot(
  agent: Agent,
  logger: Logger,
  voiceProvider?: Voice | null,
): Promise<void>;
```

**Parameters**:

| Param           | Type                                | Description                                                                                              |
| --------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `agent`         | `Agent` (from `@voltagent/core`)    | Fully configured agent with tools, memory, and model                                                     |
| `logger`        | `Logger` (from `@voltagent/logger`) | Structured logger for Telegram adapter events                                                            |
| `voiceProvider` | `Voice \| null \| undefined`        | Optional voice provider for STT/TTS. When `null`/`undefined`, voice messages get the text-only fallback. |

**Returns**: `Promise<void>` — resolves after bot is started.

---

## Updated Message Flow (Voice Enabled)

```
Telegram User
    │
    ├─── (voice message) ──────────────────────────────────────────────┐
    │                                                                   │
    │    grammy Bot.on("message:voice")                                │
    │        │                                                          │
    │        ├─ Access control check                                    │
    │        │   └─ Denied → reply "access denied"                     │
    │        │                                                          │
    │        ├─ Download: ctx.api.getFile(file_id) → fetch → Buffer    │
    │        │   └─ Error → reply "couldn't download"                  │
    │        │                                                          │
    │        ├─ STT: voiceProvider.listen(stream) → text               │
    │        │   └─ Error → reply "couldn't process voice"             │
    │        │   └─ Empty → reply "couldn't make out what you said"    │
    │        │                                                          │
    │        ├─ Agent: agent.generateText(text, { userId, convId })    │
    │        │   └─ Error → reply "something went wrong"               │
    │        │                                                          │
    │        ├─ TTS: voiceProvider.speak(response) → stream → Buffer   │
    │        │   └─ Error → skip voice, text fallback only             │
    │        │                                                          │
    │        ├─ ctx.replyWithVoice(InputFile(buffer, "reply.ogg"))     │
    │        │                                                          │
    │        └─ ctx.reply(responseText)  // Always send text too       │
    │                                                                   │
    ├─── (audio file) ────────────────────────────────────────────────┐│
    │    (Same flow as voice, using ctx.message.audio.file_id)       ││
    │                                                                  ││
    ├─── (text message) ──── existing handler (unchanged) ────────────┘│
    │                                                                   │
    └─── (other) ──── fallback "text only" ────────────────────────────┘
```

## Handler Registration Order

When `voiceProvider` is available:

```typescript
bot.on("message:voice", voiceHandler); // Voice notes
bot.on("message:audio", audioHandler); // Audio file attachments
bot.on("message:text", textHandler); // Text (existing)
bot.on("message", fallbackHandler); // Everything else (existing)
```

When `voiceProvider` is `null`/`undefined`:

```typescript
bot.on("message:text", textHandler); // Text (existing, unchanged)
bot.on("message", fallbackHandler); // Everything else including voice (existing)
```

---

## Entry Point Change

### `src/index.ts`

```typescript
// NEW: import voice provider resolver
import { resolveVoiceProvider } from "./config/voice-provider";

// NEW: resolve voice provider (returns null if disabled)
const voiceProvider = await resolveVoiceProvider(logger);

// CHANGED: pass voice provider to Telegram bot
startTelegramBot(agent, logger, voiceProvider);
```
