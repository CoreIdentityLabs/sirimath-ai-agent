# Research: Telegram Voice Messages — STT & TTS

**Feature Branch**: `003-telegram-voice-stt-tts`  
**Date**: 2026-03-20

---

## R1: @voltagent/voice Package — OpenAIVoiceProvider API

### Decision: Use `@voltagent/voice` ^2.1.0 with `OpenAIVoiceProvider` for STT (Whisper) and TTS

### Rationale

- `@voltagent/voice` is the official VoltAgent voice abstraction package, already in the `@voltagent/*` namespace (constitution-compliant).
- `OpenAIVoiceProvider` wraps the OpenAI `openai` npm package (^4.91.0) for both STT and TTS.
- It provides a clean interface: `listen(audio: ReadableStream)` → `string` for STT, `speak(text: string)` → `ReadableStream` for TTS.
- The provider is stateless and can be initialized once at startup and reused across requests.
- OpenAI Whisper supports the OGG/Opus format that Telegram voice notes use natively — no audio format conversion required.

### Alternatives Considered

| Approach                                                  | Complexity                                   | Decision                                                       |
| --------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| `@voltagent/voice` + `OpenAIVoiceProvider`                | Low — abstraction already built              | **Chosen for OpenAI**                                          |
| Custom `AzureVoiceProvider` extending `BaseVoiceProvider` | Low — thin wrapper over `AzureOpenAI` client | **Chosen for Azure**                                           |
| Direct `openai` npm package calls                         | Medium — manual stream handling              | Rejected: reinventing what `@voltagent/voice` already provides |
| Vercel AI SDK speech APIs                                 | N/A — AI SDK does not provide STT/TTS        | Not applicable                                                 |
| ElevenLabs via `@voltagent/voice`                         | Low — same abstraction                       | Future option; OpenAI/Azure preferred for launch               |

### Key API Surface (verified from package types v2.1.0)

```typescript
import { OpenAIVoiceProvider } from "@voltagent/voice";

const voice = new OpenAIVoiceProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  speechModel: "whisper-1", // STT model (default)
  ttsModel: "tts-1", // TTS model (default)
  voice: "alloy", // TTS voice (default)
});

// STT: audio stream → transcribed text
const text: string = (await voice.listen(audioStream)) as string;

// TTS: text → audio stream
const audioOut: NodeJS.ReadableStream = await voice.speak("Hello!");
```

### Constructor Options (`OpenAIVoiceOptions`)

| Option        | Type          | Default       | Description                                                                                              |
| ------------- | ------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `apiKey`      | `string`      | (required)    | OpenAI API key                                                                                           |
| `speechModel` | `string`      | `"whisper-1"` | STT model                                                                                                |
| `ttsModel`    | `string`      | `"tts-1"`     | TTS model                                                                                                |
| `voice`       | `OpenAIVoice` | `"alloy"`     | TTS voice: `"alloy"`, `"echo"`, `"fable"`, `"onyx"`, `"nova"`, `"shimmer"`, `"ash"`, `"coral"`, `"sage"` |

### Supported Audio Formats for STT

`"mp3" | "mp4" | "mpeg" | "mpga" | "m4a" | "wav" | "webm"`

Note: OGG/Opus (Telegram voice note format) is accepted by Whisper even though it's not explicitly listed. The `listen()` method forwards the stream to the OpenAI API which handles format detection.

---

## R2: grammy Voice Message Handling

### Decision: Register dedicated handlers for `message:voice` and `message:audio` events using grammy's filter system

### Rationale

- grammy supports filter queries like `"message:voice"` and `"message:audio"` to handle specific message types.
- These handlers must be registered **before** the generic `"message"` fallback handler so they take priority.
- The `ctx.message.voice` object contains `file_id`, `duration`, `mime_type`, and `file_size`.
- File download is done via `ctx.api.getFile(file_id)` which returns a `File` object with `file_path`, then fetching `https://api.telegram.org/file/bot<token>/<file_path>`.
- Voice replies are sent via `ctx.replyWithVoice(new InputFile(buffer, "reply.ogg"))`.

### Key API Details

#### Voice Message Object (Telegram API)

```typescript
interface Voice {
  file_id: string; // Use to download the file
  file_unique_id: string;
  duration: number; // Duration in seconds
  mime_type?: string; // e.g., "audio/ogg"
  file_size?: number; // Size in bytes
}
```

#### Downloading a Voice File

```typescript
import { InputFile } from "grammy";

// In a message:voice handler:
const fileId = ctx.message.voice.file_id;
const file = await ctx.api.getFile(fileId);
// file.file_path = e.g., "voice/file_123.oga"

const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
const response = await fetch(fileUrl);
const buffer = Buffer.from(await response.arrayBuffer());
```

#### Sending a Voice Reply

```typescript
import { InputFile } from "grammy";

// From a Buffer or ReadableStream:
await ctx.replyWithVoice(new InputFile(audioBuffer, "reply.ogg"));

// With additional options:
await ctx.replyWithVoice(new InputFile(audioBuffer, "reply.ogg"), {
  reply_parameters: { message_id: ctx.message.message_id },
});
```

#### Handler Registration Order (Critical)

```typescript
// Voice and audio handlers MUST be registered before the generic fallback
bot.on("message:voice", voiceHandler);
bot.on("message:audio", audioHandler); // Audio file attachments
bot.on("message:text", textHandler);
bot.on("message", fallbackHandler); // Must be LAST
```

### Alternatives Considered

| Approach                                                           | Decision                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Separate `message:voice` + `message:audio` handlers                | **Chosen** — clean, explicit                                         |
| Single handler checking `ctx.message.voice \|\| ctx.message.audio` | Rejected: grammy's filter system is designed for separate handlers   |
| Using grammy file download plugin                                  | Rejected: YAGNI — native `fetch` + `ctx.api.getFile()` is sufficient |

---

## R3: Audio Stream Bridge — Telegram Download to @voltagent/voice

### Decision: Download Telegram voice file as Buffer, convert to ReadableStream for `voice.listen()`

### Rationale

- `OpenAIVoiceProvider.listen()` expects a `NodeJS.ReadableStream` as input.
- Telegram files are downloaded via HTTPS as `ArrayBuffer` → `Buffer`.
- Node.js `Readable.from(buffer)` creates a ReadableStream from a Buffer.
- For TTS output, `voice.speak()` returns a `NodeJS.ReadableStream` which needs to be collected into a Buffer for grammy's `InputFile` constructor.

### Stream Conversion Pattern

```typescript
import { Readable } from "node:stream";

// STT: Buffer → ReadableStream → voice.listen()
const audioBuffer = Buffer.from(await response.arrayBuffer());
const audioStream = Readable.from(audioBuffer);
const transcribedText = (await voice.listen(audioStream)) as string;

// TTS: voice.speak() → ReadableStream → Buffer → InputFile
const ttsStream = await voice.speak(responseText);
const chunks: Buffer[] = [];
for await (const chunk of ttsStream) {
  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
}
const ttsBuffer = Buffer.concat(chunks);
```

### Alternatives Considered

| Approach                                                 | Decision                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| Buffer intermediary (download → Buffer → ReadableStream) | **Chosen** — simple, under 20 MB limit makes full buffering safe |
| Direct stream piping (no buffering)                      | Rejected: complicates error handling; voice files are small      |
| Temporary file on disk                                   | Rejected: unnecessary I/O; memory is sufficient for voice files  |

---

## R4: Voice Provider Configuration Pattern

### Decision: New `src/config/voice-provider.ts` module with `resolveVoiceProvider()` returning `Voice | null`

### Rationale

- Follows the same pattern as `src/config/model-provider.ts` (existing `resolveModel()` function).
- Returns `null` when `VOICE_PROVIDER` is not set, enabling callers to check for voice availability.
- Graceful degradation: invalid or misconfigured voice provider falls back to `null` with a warning log (does not crash).
- The voice provider instance is created once at startup and passed to `startTelegramBot()`.
- Supports `"openai"` (via `OpenAIVoiceProvider`) and `"azure"` (via custom `AzureVoiceProvider`).

### Environment Variables

| Variable              | Required                     | Default       | Description                                                                     |
| --------------------- | ---------------------------- | ------------- | ------------------------------------------------------------------------------- |
| `VOICE_PROVIDER`      | No                           | (empty)       | Voice provider name: `"openai"` or `"azure"`. When empty/unset, voice disabled. |
| `OPENAI_API_KEY`      | When `VOICE_PROVIDER=openai` | —             | Reuses existing OpenAI key (already required for default LLM provider)          |
| `AZURE_API_KEY`       | When `VOICE_PROVIDER=azure`  | —             | Reuses existing Azure key (already required for `MODEL_PROVIDER=azure`)         |
| `AZURE_RESOURCE_NAME` | When `VOICE_PROVIDER=azure`  | —             | Reuses existing Azure resource name                                             |
| `TTS_MODEL`           | No                           | `"tts-1"`     | TTS model (or Azure deployment name)                                            |
| `TTS_VOICE`           | No                           | `"alloy"`     | TTS voice                                                                       |
| `STT_MODEL`           | No                           | `"whisper-1"` | STT model (or Azure deployment name)                                            |

### Code Pattern

```typescript
// src/config/voice-provider.ts
import type { Voice } from "@voltagent/core";
import type { Logger } from "@voltagent/logger";

const SUPPORTED_VOICE_PROVIDERS = ["openai", "azure"] as const;
type VoiceProviderName = (typeof SUPPORTED_VOICE_PROVIDERS)[number];

export async function resolveVoiceProvider(
  logger: Logger,
): Promise<Voice | null> {
  const providerName = process.env.VOICE_PROVIDER?.toLowerCase().trim();

  if (!providerName) {
    logger.info(
      "[voice-provider] VOICE_PROVIDER not set — voice features disabled",
    );
    return null;
  }

  if (!SUPPORTED_VOICE_PROVIDERS.includes(providerName as VoiceProviderName)) {
    logger.warn(
      "[voice-provider] Unsupported VOICE_PROVIDER: '%s'. Supported: %s. Falling back to text-only.",
      providerName,
      SUPPORTED_VOICE_PROVIDERS.join(", "),
    );
    return null;
  }

  switch (providerName as VoiceProviderName) {
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        logger.error(
          "[voice-provider] VOICE_PROVIDER=openai but OPENAI_API_KEY is not set. Voice disabled.",
        );
        return null;
      }
      const { OpenAIVoiceProvider } = await import("@voltagent/voice");
      return new OpenAIVoiceProvider({
        apiKey,
        speechModel: process.env.STT_MODEL || "whisper-1",
        ttsModel: process.env.TTS_MODEL || "tts-1",
        voice: (process.env.TTS_VOICE || "alloy") as any,
      });
    }

    case "azure": {
      const apiKey = process.env.AZURE_API_KEY;
      const resourceName = process.env.AZURE_RESOURCE_NAME;
      if (!apiKey || !resourceName) {
        logger.error(
          "[voice-provider] VOICE_PROVIDER=azure but %s is not set. Voice disabled.",
          !apiKey ? "AZURE_API_KEY" : "AZURE_RESOURCE_NAME",
        );
        return null;
      }
      const { AzureVoiceProvider } =
        await import("../voice/azure-voice-provider");
      return new AzureVoiceProvider({
        apiKey,
        resourceName,
        speechModel: process.env.STT_MODEL || "whisper-1",
        ttsModel: process.env.TTS_MODEL || "tts-1",
        voice: (process.env.TTS_VOICE || "alloy") as any,
      });
    }
  }
}
```

### Alternatives Considered

| Approach                                                   | Decision                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| Separate `resolveVoiceProvider()` function in its own file | **Chosen** — consistent with `resolveModel()` pattern     |
| Inline voice init inside `telegram.ts`                     | Rejected: mixes configuration with channel protocol logic |
| Adding to `resolveModel()`                                 | Rejected: voice and LLM are independent concerns          |

---

## R5: Telegram Adapter Modification — Voice Handler Flow

### Decision: Add `message:voice` and `message:audio` handlers to the existing Telegram adapter, accepting an optional voice provider parameter

### Rationale

- The `startTelegramBot()` function signature changes from `(agent, logger)` to `(agent, logger, voiceProvider?)`.
- When `voiceProvider` is `null` or `undefined`, voice messages fall through to the existing generic fallback handler.
- When `voiceProvider` is present, voice/audio handlers are registered BEFORE the generic fallback.
- The voice handler implements the full STT → Agent → TTS → Reply pipeline.
- Text fallback is always sent alongside voice reply (FR-006).

### Updated Message Flow

```
Telegram User
    │
    ▼ (voice message)
grammy Bot.on("message:voice")
    │
    ├─ Access control check (ALLOWED_TELEGRAM_USER_IDS)
    │   └─ Denied → reply "access denied"
    │
    ├─ Download voice file (ctx.api.getFile → fetch → Buffer)
    │
    ├─ STT: voiceProvider.listen(audioStream) → transcribedText
    │   └─ Error → reply "couldn't process voice message"
    │
    ├─ agent.generateText(transcribedText, { userId, conversationId })
    │   └─ Error → reply "something went wrong"
    │
    ├─ TTS: voiceProvider.speak(responseText) → audioStream → Buffer
    │   └─ Error → fall back to text reply
    │
    ├─ ctx.replyWithVoice(new InputFile(audioBuffer, "reply.ogg"))
    │
    └─ ctx.reply(responseText)  // Text follow-up alongside voice
```

### Handler Skeleton

```typescript
// Inside startTelegramBot(), when voiceProvider is available:

bot.on("message:voice", async (ctx) => {
  const userId = ctx.from?.id?.toString() ?? "unknown";
  const conversationId = ctx.chat.id.toString();

  // Access control (same as text handler)
  if (allowedIds.size > 0 && !allowedIds.has(userId)) {
    logger.warn("[telegram] Unauthorized voice access attempt", { userId });
    await ctx.reply("Sorry, you don't have access to this assistant.");
    return;
  }

  logger.info("[telegram] Received voice message", {
    userId,
    conversationId,
    duration: ctx.message.voice.duration,
    fileSize: ctx.message.voice.file_size,
  });

  // 1. Download voice file
  let audioBuffer: Buffer;
  try {
    const file = await ctx.api.getFile(ctx.message.voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const resp = await fetch(fileUrl);
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    audioBuffer = Buffer.from(await resp.arrayBuffer());
  } catch (err) {
    logger.error("[telegram] Failed to download voice file", { err, userId });
    await ctx.reply(
      "I couldn't download your voice message. Please try again.",
    );
    return;
  }

  // 2. STT
  let transcribedText: string;
  try {
    const { Readable } = await import("node:stream");
    const audioStream = Readable.from(audioBuffer);
    transcribedText = (await voiceProvider.listen(audioStream)) as string;
  } catch (err) {
    logger.error("[telegram] STT failed", { err, userId });
    await ctx.reply(
      "I couldn't process your voice message right now. Please try again or send a text message instead.",
    );
    return;
  }

  if (!transcribedText?.trim()) {
    await ctx.reply(
      "I couldn't make out what you said. Could you please try again?",
    );
    return;
  }

  logger.info("[telegram] Voice transcribed", {
    userId,
    conversationId,
    transcriptLen: transcribedText.length,
  });

  // 3. Agent processing (identical to text handler)
  let responseText: string;
  try {
    const result = await agent.generateText(transcribedText, {
      userId,
      conversationId,
    });
    responseText =
      typeof result === "string"
        ? result
        : ((result as { text?: string }).text ?? String(result));
  } catch (err) {
    logger.error("[telegram] Error generating response for voice", {
      err,
      userId,
      conversationId,
    });
    await ctx.reply(
      "Something went wrong while processing your message. Please try again.",
    );
    return;
  }

  // 4. TTS + send voice reply
  try {
    const ttsStream = await voiceProvider.speak(responseText);
    const chunks: Buffer[] = [];
    for await (const chunk of ttsStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
    }
    const ttsBuffer = Buffer.concat(chunks);

    const { InputFile } = await import("grammy");
    await ctx.replyWithVoice(new InputFile(ttsBuffer, "reply.ogg"));
  } catch (err) {
    logger.warn("[telegram] TTS failed, falling back to text reply", {
      err,
      userId,
    });
    // Fall through to text reply below
  }

  // 5. Always send text alongside (or as fallback)
  const textChunks = splitMessage(responseText, 4096);
  for (const chunk of textChunks) {
    await ctx.reply(chunk);
  }
});
```

---

## R6: Function Signature Change — startTelegramBot

### Decision: Add optional `voiceProvider` parameter to `startTelegramBot()`

### Rationale

- Adding a third optional parameter avoids breaking the existing function contract.
- The type uses the `Voice` interface from `@voltagent/core` (which `OpenAIVoiceProvider` implements), keeping the Telegram adapter provider-agnostic.
- When `voiceProvider` is `undefined`/`null`, the adapter behaves identically to the current implementation — complete backward compatibility.

### Updated Signature

```typescript
import type { Voice } from "@voltagent/core";

export async function startTelegramBot(
  agent: Agent,
  logger: Logger,
  voiceProvider?: Voice | null,
): Promise<void>;
```

### Call Site Change (src/index.ts)

```typescript
import { resolveVoiceProvider } from "./config/voice-provider";

const voiceProvider = await resolveVoiceProvider(logger);
startTelegramBot(agent, logger, voiceProvider);
```

---

## R7: Azure OpenAI Voice Provider

### Decision: Create a thin `AzureVoiceProvider` class at `src/voice/azure-voice-provider.ts` extending `BaseVoiceProvider` from `@voltagent/voice`

### Rationale

- Azure OpenAI Service provides the same Whisper (STT) and TTS-1 models as OpenAI, with an identical API surface.
- The `openai` npm package (^4.91.0, already a transitive dependency of `@voltagent/voice`) exports an `AzureOpenAI` class that handles Azure-specific authentication and endpoint construction.
- `@voltagent/voice` does not include a built-in Azure provider, but it exports `BaseVoiceProvider` which can be extended.
- The `AzureVoiceProvider` class is ~60 lines — it wraps `AzureOpenAI` the same way `OpenAIVoiceProvider` wraps `OpenAI`, implementing only `speak()` and `listen()` with stub implementations for `connect()`, `disconnect()`, `send()`, and `getVoices()`.
- This avoids patching or monkey-patching `OpenAIVoiceProvider` and keeps the Azure-specific code isolated.

### AzureOpenAI Client (from `openai` npm package)

```typescript
import { AzureOpenAI } from "openai";

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_API_KEY,
  endpoint: `https://${process.env.AZURE_RESOURCE_NAME}.openai.azure.com/`,
  apiVersion: "2024-12-01-preview",
});

// STT (identical API to OpenAI)
const transcription = await client.audio.transcriptions.create({
  model: "whisper-1", // Azure deployment name
  file: audioFile,
});
// transcription.text = "Hello world"

// TTS (identical API to OpenAI)
const response = await client.audio.speech.create({
  model: "tts-1", // Azure deployment name
  voice: "alloy",
  input: "Hello from Azure!",
});
// response is a Response with readable body
```

### AzureVoiceProvider Implementation Sketch

```typescript
// src/voice/azure-voice-provider.ts
import { BaseVoiceProvider } from "@voltagent/voice";
import { AzureOpenAI } from "openai";
import { Readable } from "node:stream";
import type { File } from "openai/uploads";

export type AzureVoiceProviderOptions = {
  apiKey: string;
  resourceName: string;
  apiVersion?: string;
  speechModel?: string;
  ttsModel?: string;
  voice?: string;
};

export class AzureVoiceProvider extends BaseVoiceProvider {
  private readonly client: AzureOpenAI;
  private readonly speechModel: string;
  private readonly ttsModel: string;
  private readonly voice: string;

  constructor(options: AzureVoiceProviderOptions) {
    super({ apiKey: options.apiKey });
    this.client = new AzureOpenAI({
      apiKey: options.apiKey,
      endpoint: `https://${options.resourceName}.openai.azure.com/`,
      apiVersion: options.apiVersion || "2024-12-01-preview",
    });
    this.speechModel = options.speechModel || "whisper-1";
    this.ttsModel = options.ttsModel || "tts-1";
    this.voice = options.voice || "alloy";
  }

  async speak(
    text: string | NodeJS.ReadableStream,
  ): Promise<NodeJS.ReadableStream> {
    const inputText =
      typeof text === "string" ? text : await this.streamToString(text);
    const response = await this.client.audio.speech.create({
      model: this.ttsModel,
      voice: this.voice as any,
      input: inputText,
    });
    const arrayBuffer = await response.arrayBuffer();
    return Readable.from(Buffer.from(arrayBuffer));
  }

  async listen(audio: NodeJS.ReadableStream): Promise<string> {
    const transcription = await this.client.audio.transcriptions.create({
      model: this.speechModel,
      file: audio as unknown as File,
    });
    return transcription.text;
  }

  async connect(): Promise<void> {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
  async send(): Promise<void> {
    /* no-op */
  }
  async getVoices() {
    return [];
  }

  private async streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
    }
    return Buffer.concat(chunks).toString("utf-8");
  }
}
```

### Azure-Specific Environment Variables

| Variable              | Required                    | Default       | Description                         |
| --------------------- | --------------------------- | ------------- | ----------------------------------- |
| `AZURE_API_KEY`       | When `VOICE_PROVIDER=azure` | —             | Reused from LLM config              |
| `AZURE_RESOURCE_NAME` | When `VOICE_PROVIDER=azure` | —             | Reused from LLM config              |
| `TTS_MODEL`           | No                          | `"tts-1"`     | Azure deployment name for TTS       |
| `STT_MODEL`           | No                          | `"whisper-1"` | Azure deployment name for Whisper   |
| `TTS_VOICE`           | No                          | `"alloy"`     | Voice name (same options as OpenAI) |

### Alternatives Considered

| Approach                                                   | Decision                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Custom `AzureVoiceProvider` extending `BaseVoiceProvider`  | **Chosen** — clean, isolated, reuses transitive `openai` dependency  |
| Monkey-patching `OpenAIVoiceProvider` with Azure `baseURL` | Rejected: `OpenAIVoiceProvider` doesn't expose `baseURL` in options  |
| Using `OPENAI_BASE_URL` env var hack                       | Rejected: would affect LLM provider too; fragile                     |
| Waiting for `@voltagent/voice` to add Azure natively       | Rejected: unknown timeline; custom class is trivial                  |
| Direct `openai` npm calls without `BaseVoiceProvider`      | Rejected: wouldn't implement `Voice` interface; breaks type contract |
