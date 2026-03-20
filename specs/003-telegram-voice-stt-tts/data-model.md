# Data Model: Telegram Voice Messages — STT & TTS

**Feature Branch**: `003-telegram-voice-stt-tts`  
**Date**: 2026-03-20

---

## Entities

### 1. VoiceProviderConfig

Runtime-resolved voice provider configuration. Either one provider is active or voice is disabled (`null`).

| Field          | Type                                                 | Source                                      | Validation                                                                                                                       |
| -------------- | ---------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `providerName` | `VoiceProviderName` (union of `"openai" \| "azure"`) | `VOICE_PROVIDER` env var                    | Must be one of the supported values; when empty, voice disabled                                                                  |
| `apiKey`       | `string`                                             | `OPENAI_API_KEY` or `AZURE_API_KEY` env var | Non-empty when provider is `"openai"` or `"azure"` respectively                                                                  |
| `resourceName` | `string \| undefined`                                | `AZURE_RESOURCE_NAME` env var               | Required when provider is `"azure"`; not used for `"openai"`                                                                     |
| `speechModel`  | `string`                                             | `STT_MODEL` env var                         | Default `"whisper-1"`                                                                                                            |
| `ttsModel`     | `string`                                             | `TTS_MODEL` env var                         | Default `"tts-1"`                                                                                                                |
| `voice`        | `string`                                             | `TTS_VOICE` env var                         | Default `"alloy"`; must be one of: `"alloy"`, `"echo"`, `"fable"`, `"onyx"`, `"nova"`, `"shimmer"`, `"ash"`, `"coral"`, `"sage"` |

**Relationships**: Passed to `startTelegramBot()` as an optional `Voice` instance. Independent of `ProviderConfig` (LLM model).

**State Transitions**: None — immutable after startup. Changing voice provider requires restart.

---

### 2. IncomingVoiceMessage (Ephemeral)

Represents a Telegram voice note or audio file received by the bot. Not persisted — processed in-flight.

| Field            | Type                  | Source                                                     | Validation                                        |
| ---------------- | --------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `fileId`         | `string`              | `ctx.message.voice.file_id` or `ctx.message.audio.file_id` | Non-empty; used for download                      |
| `duration`       | `number`              | `ctx.message.voice.duration`                               | Positive integer (seconds)                        |
| `mimeType`       | `string \| undefined` | `ctx.message.voice.mime_type`                              | Optional; typically `"audio/ogg"` for voice notes |
| `fileSize`       | `number \| undefined` | `ctx.message.voice.file_size`                              | Optional; max ~20 MB (Telegram download limit)    |
| `userId`         | `string`              | `ctx.from.id.toString()`                                   | Numeric string                                    |
| `conversationId` | `string`              | `ctx.chat.id.toString()`                                   | Numeric string                                    |

**Relationships**: Triggers the voice processing pipeline. The downloaded audio is fed to the STT provider.

**State Transitions**: Received → Downloaded → Transcribed → (text fed to agent) → Discarded. No persistence.

---

### 3. Transcription (Ephemeral)

The text output from STT processing. Not persisted as a separate entity — the transcribed text is passed directly to `agent.generateText()` which stores it in the conversation memory as a normal user message.

| Field            | Type     | Source                              | Validation                        |
| ---------------- | -------- | ----------------------------------- | --------------------------------- |
| `text`           | `string` | `voiceProvider.listen(audioStream)` | May be empty if audio was silence |
| `userId`         | `string` | From voice message context          | Same as originating voice message |
| `conversationId` | `string` | From voice message context          | Same as originating voice message |

**Relationships**: Input to `agent.generateText()`. The agent's memory system handles persistence of the user message and the assistant's response automatically.

---

### 4. VoiceReply (Ephemeral)

The TTS-generated audio buffer sent back as a Telegram voice message. Not persisted — created in-flight and sent.

| Field         | Type     | Source                                            | Validation                                |
| ------------- | -------- | ------------------------------------------------- | ----------------------------------------- |
| `audioBuffer` | `Buffer` | Collected from `voiceProvider.speak(text)` stream | Non-empty; should be under 50 MB          |
| `textContent` | `string` | Agent's response text                             | Non-empty; sent as follow-up text message |
| `filename`    | `string` | Hardcoded `"reply.ogg"`                           | Constant                                  |

**Relationships**: Derived from the agent's text response. Sent via `ctx.replyWithVoice()` followed by `ctx.reply()` for the text version.

---

## Environment Variables (New)

| Variable         | Required | Default            | Description                                                                              |
| ---------------- | -------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `VOICE_PROVIDER` | No       | (empty = disabled) | Voice provider name: `"openai"` or `"azure"`. When empty/unset, voice features disabled. |
| `TTS_MODEL`      | No       | `"tts-1"`          | TTS model (e.g., `"tts-1"`, `"tts-1-hd"`) or Azure deployment name                       |
| `TTS_VOICE`      | No       | `"alloy"`          | TTS voice name                                                                           |
| `STT_MODEL`      | No       | `"whisper-1"`      | STT model or Azure deployment name                                                       |

## Environment Variables (Existing — Unchanged)

| Variable                    | Required                                                | Default        | Description                               |
| --------------------------- | ------------------------------------------------------- | -------------- | ----------------------------------------- |
| `TELEGRAM_BOT_TOKEN`        | **Yes**                                                 | —              | Telegram bot token                        |
| `OPENAI_API_KEY`            | When `MODEL_PROVIDER=openai` or `VOICE_PROVIDER=openai` | —              | Reused for both LLM and voice             |
| `AZURE_API_KEY`             | When `MODEL_PROVIDER=azure` or `VOICE_PROVIDER=azure`   | —              | Reused for both LLM and voice             |
| `AZURE_RESOURCE_NAME`       | When `MODEL_PROVIDER=azure` or `VOICE_PROVIDER=azure`   | —              | Reused for both LLM and voice             |
| `ALLOWED_TELEGRAM_USER_IDS` | No                                                      | (empty = open) | Comma-separated Telegram user IDs allowed |

---

## No New Persistence

This feature introduces **no new database tables, collections, or files**. All voice processing is ephemeral:

- Voice files are downloaded into memory (`Buffer`), processed, and discarded.
- Transcribed text flows through `agent.generateText()`, which automatically persists it in the existing conversation memory (LibSQL).
- TTS audio is generated, sent to Telegram, and discarded.

The existing `Memory` system (LibSQL) handles all conversation persistence — voice messages appear in history as the transcribed text content, indistinguishable from typed text.
