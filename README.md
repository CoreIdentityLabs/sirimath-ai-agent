<div align="center">
  <h1>⚡ sirimath-ai-agent</h1>
  <p>Personal AI assistant on Telegram — powered by <a href="https://voltagent.dev">VoltAgent</a> with BYOK multi-provider LLM support, voice messages (STT & TTS), and self-extending skills.</p>

  <p>
    <a href="https://github.com/voltagent/voltagent"><img src="https://img.shields.io/badge/built%20with-VoltAgent-blue" alt="Built with VoltAgent" /></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node Version" /></a>
  </p>
</div>

---

## What is this?

A Telegram bot that acts as your personal AI assistant. You bring your own LLM key (OpenAI, Anthropic, Google, Azure AI Foundry, Groq, Mistral, local Ollama, or local LM Studio) — no vendor lock-in. The assistant can search the web, fetch live data, look up real-time weather, process voice messages (speech-to-text), reply with synthesised voice (text-to-speech), and discover + install new capabilities on demand from [skills.sh](https://skills.sh).

---

## Features

| Capability             | Detail                                                                     |
| ---------------------- | -------------------------------------------------------------------------- |
| 💬 Telegram chat       | Full multi-turn conversations with persistent memory                       |
| 🎙️ Voice messages      | Send voice notes — transcribed via STT, replied to with voice + text       |
| 🔊 Voice replies (TTS) | Bot replies with a synthesised voice note alongside every text follow-up   |
| 🔑 BYOK multi-provider | 8 LLM providers switchable via env vars, zero code changes                 |
| 🌐 Web access          | `fetchUrl` (HTTP GET any endpoint), optional `webSearch` (Brave or Tavily) |
| 🌤️ Real weather        | Live weather via open-meteo.com — no API key needed                        |
| 🔍 Skill discovery     | Search skills.sh and install new capabilities on demand                    |
| 🔒 Access control      | Optional allowlist via `ALLOWED_TELEGRAM_USER_IDS`                         |
| 📊 Observability       | VoltOps dashboard (local dev + production)                                 |

---

## Prerequisites

- **Node.js 22+**
- **Telegram bot token** — create one via [@BotFather](https://t.me/BotFather) (`/newbot`)
- **At least one LLM API key** (or Ollama running locally)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env

# 3. Edit .env — at minimum set these two:
#    TELEGRAM_BOT_TOKEN=...
#    OPENAI_API_KEY=...   (or any other provider)

# 4. Start in development mode
npm run dev
```

Open Telegram, find your bot by its handle, and send a message.

---

## Configuration

All configuration is done via environment variables. Copy `.env.example` to `.env` and edit.

### Required

```env
# Your Telegram bot token from BotFather
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

### LLM Provider (pick one)

| Provider         | `MODEL_PROVIDER` | Required env vars                      | Example `MODEL_ID`         |
| ---------------- | ---------------- | -------------------------------------- | -------------------------- |
| OpenAI           | `openai`         | `OPENAI_API_KEY`                       | `gpt-4o-mini`              |
| Anthropic        | `anthropic`      | `ANTHROPIC_API_KEY`                    | `claude-sonnet-4-20250514` |
| Google Gemini    | `google`         | `GOOGLE_GENERATIVE_AI_API_KEY`         | `gemini-2.0-flash-exp`     |
| Azure AI Foundry | `azure`          | `AZURE_API_KEY`, `AZURE_RESOURCE_NAME` | `gpt-4o` (deployment name) |
| Groq             | `groq`           | `GROQ_API_KEY`                         | `llama-3.3-70b-versatile`  |
| Mistral          | `mistral`        | `MISTRAL_API_KEY`                      | `mistral-large-latest`     |
| Ollama (local)   | `ollama`         | _(none)_                               | `llama3.2`                 |
| LM Studio (local)| `lmstudio`       | _(none)_                               | `llama-3.2-1b`             |

Default when nothing is set: `openai` / `gpt-4o-mini`.

```env
MODEL_PROVIDER=openai
MODEL_ID=gpt-4o-mini
OPENAI_API_KEY=sk-...
```

> **Azure note**: For Azure AI Foundry, `MODEL_ID` is your **deployment name** (not the model family name). The agent uses the Chat Completions API explicitly to ensure compatibility with reasoning models (`o1`, `o3`, `gpt-5.x`) in multi-turn conversations.

> **LM Studio note**: No API key required. LM Studio must be running with its local server started (LM Studio → Local Server tab → Start Server). Override the default `http://localhost:1234/v1` endpoint via `LMSTUDIO_BASE_URL`.

### Telegram Options

```env
# "polling" for local dev, "webhook" for production server
TELEGRAM_MODE=polling

# Required only for webhook mode — must be a public HTTPS URL
# TELEGRAM_WEBHOOK_URL=https://yourserver.com/webhook

# Optional: restrict access to specific Telegram user IDs
# Get your ID from @userinfobot on Telegram
# ALLOWED_TELEGRAM_USER_IDS=123456789,987654321
```

### Voice Provider — STT & TTS (optional)

Voice features are opt-in. When `VOICE_PROVIDER` is not set, the bot works in text-only mode.

```env
# Enable voice: "openai" or "azure"
VOICE_PROVIDER=openai

# STT model (speech-to-text). Default: whisper-1
# STT_MODEL=whisper-1

# TTS model (text-to-speech). Default: tts-1
# TTS_MODEL=tts-1

# TTS voice. Default: alloy
# Options: alloy, echo, fable, onyx, nova, shimmer, ash, coral, sage
# TTS_VOICE=alloy
```

#### OpenAI voice

Reuses your existing `OPENAI_API_KEY`. No extra credentials needed.

```env
VOICE_PROVIDER=openai
# OPENAI_API_KEY already set above
STT_MODEL=whisper-1          # optional, this is the default
TTS_MODEL=tts-1              # optional, this is the default
TTS_VOICE=alloy              # optional
```

#### Azure OpenAI voice

Azure requires **deployment names**, not model names. You must create dedicated Whisper and TTS deployments in [Azure AI Foundry](https://ai.azure.com) and use those names here. Both `STT_MODEL` and `TTS_MODEL` are **required** for Azure — there is no safe default.

```env
VOICE_PROVIDER=azure
AZURE_API_KEY=your_azure_api_key
AZURE_RESOURCE_NAME=your-resource-name   # e.g. my-openai-resource (without .openai.azure.com)
STT_MODEL=my-whisper-deployment          # your Whisper deployment name in Azure AI Foundry
TTS_MODEL=my-tts-deployment              # your TTS deployment name in Azure AI Foundry
TTS_VOICE=alloy                          # optional
```

> **How to create Azure voice deployments**: In Azure AI Foundry → Deployments → **Deploy model** → search for `whisper` (for STT) and `tts` (for TTS). The deployment name you choose is what goes in `STT_MODEL` / `TTS_MODEL`.

#### How voice messages work

1. User sends a voice note or audio file to the bot
2. The bot downloads the audio from Telegram
3. Audio is transcribed via STT (`voiceProvider.listen()`)
4. Transcript is sent to the agent (`agent.generateText()`)
5. Agent response is synthesised to audio via TTS (`voiceProvider.speak()`)
6. Bot replies with the voice note **and** the text response
7. If TTS fails for any reason, the bot gracefully falls back to text-only

### Web Search (optional)

Set **one** of the following to enable the `webSearch` tool:

```env
# Brave Search API — https://api.search.brave.com
# BRAVE_SEARCH_API_KEY=your-brave-search-api-key

# Tavily — designed for AI agents — https://tavily.com
# TAVILY_API_KEY=your-tavily-api-key
```

Without a search key, `fetchUrl` and `getWeather` still work fully.

### VoltOps Observability (optional)

```env
VOLTAGENT_PUBLIC_KEY=
VOLTAGENT_SECRET_KEY=
```

Leave empty to disable telemetry (nothing is sent). Get keys at [console.voltagent.dev](https://console.voltagent.dev/tracing-setup).

---

## Project Structure

```
sirimath-ai-agent/
├── src/
│   ├── index.ts                  # Agent bootstrap — model, voice, tools, memory, Telegram
│   ├── channels/
│   │   └── telegram.ts           # Telegram adapter — text, voice, audio handlers
│   ├── config/
│   │   ├── model-provider.ts     # BYOK LLM provider factory (resolveModel)
│   │   └── voice-provider.ts     # Voice provider factory (resolveVoiceProvider)
│   ├── voice/
│   │   └── azure-voice-provider.ts  # AzureVoiceProvider — STT + TTS via AzureOpenAI
│   └── tools/
│       ├── index.ts              # Tool exports
│       ├── weather.ts            # getWeather — real data via open-meteo.com
│       ├── fetch-url.ts          # fetchUrl — HTTP GET any URL
│       ├── web-search.ts         # webSearch — Brave or Tavily (optional)
│       ├── find-skills.ts        # findSkills — search skills.sh
│       └── install-skill.ts      # installSkill — fetch & save SKILL.md
├── skills/                       # Installed skills (persisted across restarts)
├── specs/                        # Feature specifications
├── .voltagent/                   # Agent memory & observability DBs (SQLite)
├── .env.example                  # All env vars documented
├── Dockerfile                    # Production container
└── tsconfig.json
```

---

## Available Tools

The agent has these tools registered at runtime:

| Tool           | Trigger                           | Notes                                    |
| -------------- | --------------------------------- | ---------------------------------------- |
| `getWeather`   | "weather in [city]"               | open-meteo.com, no API key needed        |
| `fetchUrl`     | "fetch [url]" / "call this API"   | HTTP GET, returns up to 12KB             |
| `webSearch`    | "search for [topic]"              | Only active when a search API key is set |
| `findSkills`   | "find a skill for [topic]"        | Searches skills.sh, returns top 15       |
| `installSkill` | Pick a number from search results | Downloads SKILL.md to `./skills/`        |

---

## Skill Discovery

Skills are capabilities sourced from [skills.sh](https://skills.sh). You can discover and install them directly from Telegram:

```
You: find a skill for code review
Bot: [shows numbered list of matching skills]

You: 1
Bot: Installing "code-review" from anthropics/skills…
     ✅ Installed. Location: ./skills/code-review/
```

Installed skills are saved as SKILL.md files under `./skills/` and persist across restarts.

> **Note**: Installing a skill downloads its definition. For the agent to _execute_ the capability described by a skill, the relevant tool must also be implemented (e.g., web search requires `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY`).

---

## Running Scripts

```bash
npm run dev        # Development with hot reload (tsx watch)
npm run build      # Compile TypeScript to dist/
npm start          # Run compiled production build
npm run typecheck  # Type-check without emitting
npm run lint       # Biome lint check
npm run lint:fix   # Biome lint + auto-fix
```

---

## Docker Deployment

```bash
# Build
docker build -t sirimath-ai-agent .

# Run (pass your .env file)
docker run -p 3141:3141 --env-file .env sirimath-ai-agent
```

For webhook mode in production, set `TELEGRAM_MODE=webhook` and `TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook` in your environment. The Hono server listens on port 3141.

---

## VoltOps Observability

### Local Development

1. `npm run dev`
2. Visit [console.voltagent.dev](https://console.voltagent.dev)
3. The console auto-connects to `http://localhost:3141`

### Production

Configure `VOLTAGENT_PUBLIC_KEY` and `VOLTAGENT_SECRET_KEY` in your environment to send traces to the VoltOps cloud dashboard.

---

## Adding New Providers

Edit `src/config/model-provider.ts` and add a case to the switch:

```typescript
case "myprovider": {
  requireEnv("MYPROVIDER_API_KEY", "myprovider");
  const { createMyProvider } = await import("@ai-sdk/myprovider");
  return createMyProvider({ apiKey: process.env.MYPROVIDER_API_KEY })(modelId);
}
```

---

## Adding New Tools

Create a file in `src/tools/`, export from `src/tools/index.ts`, and add to the `tools` array in `src/index.ts`:

```typescript
import { createTool } from "@voltagent/core";
import { z } from "zod";

export const myTool = createTool({
  name: "myTool",
  description: "What this tool does — the model reads this",
  parameters: z.object({
    input: z.string().describe("The input parameter"),
  }),
  execute: async ({ input }) => {
    // Do something real here
    return { result: input.toUpperCase() };
  },
});
```

---

## Adding New Channels

Create a file under `src/channels/` (e.g. `slack.ts`, `whatsapp.ts`) that accepts the configured `agent` instance and a `logger`. The channel adapter should only translate between the messaging protocol and `agent.generateText()` — no agent logic, no tool definitions.

---

## Resources

- [VoltAgent Docs](https://voltagent.dev/docs/)
- [VoltAgent Examples](https://github.com/VoltAgent/voltagent/tree/main/examples)
- [skills.sh](https://skills.sh) — skill ecosystem
- [grammy Docs](https://grammy.dev) — Telegram Bot framework
- [open-meteo.com](https://open-meteo.com) — free weather API
- [VoltAgent Discord](https://s.voltagent.dev/discord)

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <p>Built with ❤️ using <a href="https://voltagent.dev">VoltAgent</a></p>
</div>

---

## What is this?

A Telegram bot that acts as your personal AI assistant. You bring your own LLM key (OpenAI, Anthropic, Google, Azure AI Foundry, Groq, Mistral, local Ollama, or local LM Studio) — no vendor lock-in. The assistant can search the web, fetch live data, look up real-time weather, and discover + install new capabilities on demand from [skills.sh](https://skills.sh).

---

## Features

| Capability             | Detail                                                                     |
| ---------------------- | -------------------------------------------------------------------------- |
| 💬 Telegram chat       | Full multi-turn conversations with persistent memory                       |
| 🔑 BYOK multi-provider | 8 LLM providers switchable via env vars, zero code changes                 |
| 🌐 Web access          | `fetchUrl` (HTTP GET any endpoint), optional `webSearch` (Brave or Tavily) |
| 🌤️ Real weather        | Live weather via open-meteo.com — no API key needed                        |
| 🔍 Skill discovery     | Search skills.sh and install new capabilities on demand                    |
| 🔒 Access control      | Optional allowlist via `ALLOWED_TELEGRAM_USER_IDS`                         |
| 📊 Observability       | VoltOps dashboard (local dev + production)                                 |

---

## Prerequisites

- **Node.js 22+**
- **Telegram bot token** — create one via [@BotFather](https://t.me/BotFather) (`/newbot`)
- **At least one LLM API key** (or Ollama running locally)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env

# 3. Edit .env — at minimum set these two:
#    TELEGRAM_BOT_TOKEN=...
#    OPENAI_API_KEY=...   (or any other provider)

# 4. Start in development mode
npm run dev
```

Open Telegram, find your bot by its handle, and send a message.

---

## Configuration

All configuration is done via environment variables. Copy `.env.example` to `.env` and edit.

### Required

```env
# Your Telegram bot token from BotFather
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

### LLM Provider (pick one)

| Provider         | `MODEL_PROVIDER` | Required env vars                      | Example `MODEL_ID`         |
| ---------------- | ---------------- | -------------------------------------- | -------------------------- |
| OpenAI           | `openai`         | `OPENAI_API_KEY`                       | `gpt-4o-mini`              |
| Anthropic        | `anthropic`      | `ANTHROPIC_API_KEY`                    | `claude-sonnet-4-20250514` |
| Google Gemini    | `google`         | `GOOGLE_GENERATIVE_AI_API_KEY`         | `gemini-2.0-flash-exp`     |
| Azure AI Foundry | `azure`          | `AZURE_API_KEY`, `AZURE_RESOURCE_NAME` | `gpt-4o` (deployment name) |
| Groq             | `groq`           | `GROQ_API_KEY`                         | `llama-3.3-70b-versatile`  |
| Mistral          | `mistral`        | `MISTRAL_API_KEY`                      | `mistral-large-latest`     |
| Ollama (local)   | `ollama`         | _(none)_                               | `llama3.2`                 |
| LM Studio (local)| `lmstudio`       | _(none)_                               | `llama-3.2-1b`             |

Default when nothing is set: `openai` / `gpt-4o-mini`.

```env
MODEL_PROVIDER=openai
MODEL_ID=gpt-4o-mini
OPENAI_API_KEY=sk-...
```

> **Azure note**: For Azure AI Foundry, `MODEL_ID` is your **deployment name** (not the model family name). The agent uses the Chat Completions API explicitly to ensure compatibility with reasoning models (`o1`, `o3`, `gpt-5.x`) in multi-turn conversations.

> **LM Studio note**: No API key required. LM Studio must be running with its local server started (LM Studio → Local Server tab → Start Server). Override the default `http://localhost:1234/v1` endpoint via `LMSTUDIO_BASE_URL`.

### Telegram Options

```env
# "polling" for local dev, "webhook" for production server
TELEGRAM_MODE=polling

# Required only for webhook mode — must be a public HTTPS URL
# TELEGRAM_WEBHOOK_URL=https://yourserver.com/webhook

# Optional: restrict access to specific Telegram user IDs
# Get your ID from @userinfobot on Telegram
# ALLOWED_TELEGRAM_USER_IDS=123456789,987654321
```

### Web Search (optional)

Set **one** of the following to enable the `webSearch` tool:

```env
# Brave Search API — https://api.search.brave.com
# BRAVE_SEARCH_API_KEY=your-brave-search-api-key

# Tavily — designed for AI agents — https://tavily.com
# TAVILY_API_KEY=your-tavily-api-key
```

Without a search key, `fetchUrl` and `getWeather` still work fully.

### VoltOps Observability (optional)

```env
VOLTAGENT_PUBLIC_KEY=
VOLTAGENT_SECRET_KEY=
```

Leave empty to disable telemetry (nothing is sent). Get keys at [console.voltagent.dev](https://console.voltagent.dev/tracing-setup).

---

## Project Structure

```
sirimath-ai-agent/
├── src/
│   ├── index.ts                  # Agent bootstrap — model, tools, memory, Telegram
│   ├── channels/
│   │   └── telegram.ts           # Telegram adapter (grammy) — polling & webhook
│   ├── config/
│   │   └── model-provider.ts     # BYOK provider factory (resolveModel)
│   └── tools/
│       ├── index.ts              # Tool exports
│       ├── weather.ts            # getWeather — real data via open-meteo.com
│       ├── fetch-url.ts          # fetchUrl — HTTP GET any URL
│       ├── web-search.ts         # webSearch — Brave or Tavily (optional)
│       ├── find-skills.ts        # findSkills — search skills.sh
│       └── install-skill.ts      # installSkill — fetch & save SKILL.md
├── skills/                       # Installed skills (persisted across restarts)
├── specs/                        # Feature specifications
├── .voltagent/                   # Agent memory & observability DBs (SQLite)
├── .env.example                  # All env vars documented
├── Dockerfile                    # Production container
└── tsconfig.json
```

---

## Available Tools

The agent has these tools registered at runtime:

| Tool           | Trigger                           | Notes                                    |
| -------------- | --------------------------------- | ---------------------------------------- |
| `getWeather`   | "weather in [city]"               | open-meteo.com, no API key needed        |
| `fetchUrl`     | "fetch [url]" / "call this API"   | HTTP GET, returns up to 12KB             |
| `webSearch`    | "search for [topic]"              | Only active when a search API key is set |
| `findSkills`   | "find a skill for [topic]"        | Searches skills.sh, returns top 15       |
| `installSkill` | Pick a number from search results | Downloads SKILL.md to `./skills/`        |

---

## Skill Discovery

Skills are capabilities sourced from [skills.sh](https://skills.sh). You can discover and install them directly from Telegram:

```
You: find a skill for code review
Bot: [shows numbered list of matching skills]

You: 1
Bot: Installing "code-review" from anthropics/skills…
     ✅ Installed. Location: ./skills/code-review/
```

Installed skills are saved as SKILL.md files under `./skills/` and persist across restarts.

> **Note**: Installing a skill downloads its definition. For the agent to _execute_ the capability described by a skill, the relevant tool must also be implemented (e.g., web search requires `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY`).

---

## Running Scripts

```bash
npm run dev        # Development with hot reload (tsx watch)
npm run build      # Compile TypeScript to dist/
npm start          # Run compiled production build
npm run typecheck  # Type-check without emitting
npm run lint       # Biome lint check
npm run lint:fix   # Biome lint + auto-fix
```

---

## Docker Deployment

```bash
# Build
docker build -t sirimath-ai-agent .

# Run (pass your .env file)
docker run -p 3141:3141 --env-file .env sirimath-ai-agent
```

For webhook mode in production, set `TELEGRAM_MODE=webhook` and `TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook` in your environment. The Hono server listens on port 3141.

---

## VoltOps Observability

### Local Development

1. `npm run dev`
2. Visit [console.voltagent.dev](https://console.voltagent.dev)
3. The console auto-connects to `http://localhost:3141`

### Production

Configure `VOLTAGENT_PUBLIC_KEY` and `VOLTAGENT_SECRET_KEY` in your environment to send traces to the VoltOps cloud dashboard.

---

## Adding New Providers

Edit `src/config/model-provider.ts` and add a case to the switch:

```typescript
case "myprovider": {
  requireEnv("MYPROVIDER_API_KEY", "myprovider");
  const { createMyProvider } = await import("@ai-sdk/myprovider");
  return createMyProvider({ apiKey: process.env.MYPROVIDER_API_KEY })(modelId);
}
```

---

## Adding New Tools

Create a file in `src/tools/`, export from `src/tools/index.ts`, and add to the `tools` array in `src/index.ts`:

```typescript
import { createTool } from "@voltagent/core";
import { z } from "zod";

export const myTool = createTool({
  name: "myTool",
  description: "What this tool does — the model reads this",
  parameters: z.object({
    input: z.string().describe("The input parameter"),
  }),
  execute: async ({ input }) => {
    // Do something real here
    return { result: input.toUpperCase() };
  },
});
```

---

## Adding New Channels

Create a file under `src/channels/` (e.g. `slack.ts`, `whatsapp.ts`) that accepts the configured `agent` instance and a `logger`. The channel adapter should only translate between the messaging protocol and `agent.generateText()` — no agent logic, no tool definitions.

---

## Resources

- [VoltAgent Docs](https://voltagent.dev/docs/)
- [VoltAgent Examples](https://github.com/VoltAgent/voltagent/tree/main/examples)
- [skills.sh](https://skills.sh) — skill ecosystem
- [grammy Docs](https://grammy.dev) — Telegram Bot framework
- [open-meteo.com](https://open-meteo.com) — free weather API
- [VoltAgent Discord](https://s.voltagent.dev/discord)

---

## License

MIT — see [LICENSE](LICENSE) for details.

---
