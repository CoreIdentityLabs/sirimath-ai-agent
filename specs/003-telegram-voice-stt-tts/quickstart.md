# Quickstart: Telegram Voice Messages — STT & TTS

## Prerequisites

- Everything from the base assistant ([001 quickstart](../../001-telegram-byok-assistant/quickstart.md))
- An OpenAI API key **or** Azure OpenAI credentials (already configured if using either as LLM provider)

## 1. Install Voice Dependency

```bash
npm install @voltagent/voice
```

## 2. Configure Environment

Add voice settings to your `.env`:

```bash
# Voice Provider (optional — omit to keep text-only mode)
VOICE_PROVIDER=openai

# Optional: customize voice settings
# TTS_MODEL=tts-1          # or tts-1-hd for higher quality
# TTS_VOICE=alloy           # alloy, echo, fable, onyx, nova, shimmer, ash, coral, sage
# STT_MODEL=whisper-1
```

No new API key needed — `OPENAI_API_KEY` is reused for voice services.

### Option B: Azure OpenAI Voice

```bash
# Voice Provider — Azure
VOICE_PROVIDER=azure

# Azure credentials (reused from LLM config if MODEL_PROVIDER=azure)
AZURE_API_KEY=your-azure-key
AZURE_RESOURCE_NAME=your-resource-name

# Optional: customize voice settings (these are Azure deployment names)
# TTS_MODEL=tts-1
# TTS_VOICE=alloy
# STT_MODEL=whisper-1
```

No new API key needed — `AZURE_API_KEY` and `AZURE_RESOURCE_NAME` are reused if you already use Azure for LLM.

> **Note**: Azure OpenAI requires you to deploy Whisper and TTS models in your Azure OpenAI resource. The `STT_MODEL` and `TTS_MODEL` values must match your Azure deployment names.

## 3. Start the Bot

```bash
npm run dev
```

Look for the log line confirming voice is enabled:

```
[voice-provider] Voice provider initialized: openai (STT: whisper-1, TTS: tts-1, voice: alloy)
```

## 4. Test Voice Input

1. Open Telegram and find your bot
2. Hold the microphone button and record a voice message (e.g., "What's the weather in Colombo?")
3. Send the voice note
4. You should receive:
   - A **voice reply** (the assistant speaking the response)
   - A **text message** with the same response content

## 5. Test Text Input (Unchanged)

Text messages continue to work exactly as before — text input always gets text output:

1. Type "Hello" and send
2. You receive a text reply (no voice)

## Disabling Voice

To disable voice features, either:

- Remove `VOICE_PROVIDER` from `.env`
- Set `VOICE_PROVIDER=` (empty value)

The bot reverts to text-only mode. Voice messages receive the fallback: "I currently support text messages only."

## Troubleshooting

| Problem                              | Solution                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Voice messages get "text only" reply | Check `VOICE_PROVIDER=openai` or `VOICE_PROVIDER=azure` is set in `.env`  |
| "OPENAI_API_KEY is not set" warning  | Ensure `OPENAI_API_KEY` is set (required for `VOICE_PROVIDER=openai`)     |
| "AZURE_RESOURCE_NAME is not set"     | Ensure `AZURE_RESOURCE_NAME` is set (required for `VOICE_PROVIDER=azure`) |
| TTS fails, only text reply sent      | Check API key has TTS access; check `TTS_MODEL` is valid deployment       |
| STT returns garbled text             | Speak clearly; Whisper works best with minimal background noise           |
| Voice reply sounds robotic           | Try `TTS_MODEL=tts-1-hd` for higher quality (slower, higher cost)         |
| Unsupported voice provider warning   | Only `openai` and `azure` are supported; check `VOICE_PROVIDER` spelling  |

## Environment Variables Reference

| Variable              | Required                     | Default     | Description                                |
| --------------------- | ---------------------------- | ----------- | ------------------------------------------ |
| `VOICE_PROVIDER`      | No                           | (disabled)  | Set to `openai` or `azure` to enable voice |
| `OPENAI_API_KEY`      | When `VOICE_PROVIDER=openai` | —           | Reused from LLM config                     |
| `AZURE_API_KEY`       | When `VOICE_PROVIDER=azure`  | —           | Reused from LLM config                     |
| `AZURE_RESOURCE_NAME` | When `VOICE_PROVIDER=azure`  | —           | Reused from LLM config                     |
| `TTS_MODEL`           | No                           | `tts-1`     | TTS model / Azure deployment name          |
| `TTS_VOICE`           | No                           | `alloy`     | Voice name                                 |
| `STT_MODEL`           | No                           | `whisper-1` | STT model / Azure deployment name          |
