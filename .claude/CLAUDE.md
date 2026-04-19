# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Development with hot reload (tsx watch, loads .env)
npm run build        # Compile TypeScript to dist/ via tsdown
npm start            # Run production build (node dist/index.js)
npm run typecheck    # Type-check without emitting
npm run lint         # Biome lint check on src/
npm run lint:fix     # Biome lint with auto-fix
```

No test suite is configured. Type-check (`npm run typecheck`) and lint (`npm run lint`) are the primary correctness gates.

## Architecture

**Sirimath** is a Telegram-based personal AI assistant built on [VoltAgent](https://voltagent.dev). Users interact via Telegram; the agent processes requests with a pluggable LLM, executes tools, and optionally responds with voice.

### Data Flow

```
Telegram (text/voice) → telegram.ts → agent.generateText() → LLM provider
                                                           ↓
                                                      Tool execution
                                                      (weather, fetch, search, skills)
                                                           ↓
                              Telegram reply ← TTS (optional) ← Response text
```

### Key Source Files

| File | Purpose |
|------|---------|
| [src/index.ts](src/index.ts) | Bootstrap: wires Agent, Memory, Voice, VoltAgent server, Telegram channel |
| [src/channels/telegram.ts](src/channels/telegram.ts) | grammy bot — handles text/voice messages, polling vs webhook, 4096-char splitting, access control |
| [src/config/model-provider.ts](src/config/model-provider.ts) | Factory resolving `MODEL_PROVIDER` + `MODEL_ID` env vars to an AI SDK model |
| [src/config/voice-provider.ts](src/config/voice-provider.ts) | Factory for STT/TTS (OpenAI or Azure) |
| [src/voice/azure-voice-provider.ts](src/voice/azure-voice-provider.ts) | Custom Azure voice provider (STT + TTS via REST) |
| [src/tools/](src/tools/) | Tool implementations: `weather`, `fetch-url`, `web-search`, `find-skills`, `install-skill` |

### LLM Provider System

`MODEL_PROVIDER` selects one of 7 providers at startup (no code changes needed):

| `MODEL_PROVIDER` value | Key env var(s) |
|------------------------|----------------|
| `openai` | `OPENAI_API_KEY` |
| `anthropic` | `ANTHROPIC_API_KEY` |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| `azure` | `AZURE_API_KEY`, `AZURE_RESOURCE_NAME`, `AZURE_DEPLOYMENT_NAME` |
| `groq` | `GROQ_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |
| `ollama` | `OLLAMA_BASE_URL` |

Azure uses `.chat()` explicitly to hit Chat Completions (required for reasoning models).

### Voice Architecture

- **STT**: OpenAI Whisper or Azure Whisper deployment (downloads Telegram voice → transcribes)
- **TTS**: OpenAI tts-1 or Azure TTS deployment (text → audio reply)
- Gracefully falls back to text-only if TTS fails
- Enable by setting `VOICE_PROVIDER=openai` or `VOICE_PROVIDER=azure` plus model/voice env vars

### Memory & Observability

- LibSQL (SQLite) at `.voltagent/memory.db` — per-user conversation history, auto-persisted
- LibSQL at `.voltagent/observability.db` — optional tracing/telemetry
- VoltOps dashboard enabled when `VOLTAGENT_PUBLIC_KEY` + `VOLTAGENT_SECRET_KEY` are set

### Skill System

The `findSkills` and `installSkill` tools connect to the skills.sh ecosystem. Downloaded `SKILL.md` files are written to `./skills/` and persist across restarts, but they describe capabilities — they don't auto-execute without tool implementations.

## Environment Variables

Copy `.env.example` to `.env`. Minimum required:

```
TELEGRAM_BOT_TOKEN=       # From @BotFather
MODEL_PROVIDER=openai     # e.g., openai, anthropic, azure, groq, ollama...
MODEL_ID=gpt-4o           # Model name for the selected provider
OPENAI_API_KEY=           # Or whichever provider key matches MODEL_PROVIDER
```

Optional: `VOICE_PROVIDER`, `STT_MODEL`, `TTS_MODEL`, `TTS_VOICE`, `BRAVE_SEARCH_API_KEY` or `TAVILY_API_KEY`, `ALLOWED_TELEGRAM_USER_IDS`, `TELEGRAM_MODE=webhook`, `TELEGRAM_WEBHOOK_URL`.

## Production / Docker

```bash
docker build -t sirimath-ai-agent .
docker run --env-file .env sirimath-ai-agent
```

The Dockerfile uses Node 22-alpine, multi-stage build, `dumb-init` for signal handling, and a non-root user. Set `TELEGRAM_MODE=webhook` and `TELEGRAM_WEBHOOK_URL` for production webhook mode instead of polling.

## Tooling Notes

- **Linter**: Biome (not ESLint/Prettier) — use `npm run lint:fix` to auto-fix
- **Bundler**: tsdown (not tsc directly for builds)
- **Runtime executor**: tsx for `npm run dev`
- **TypeScript**: strict mode, ES2022 target, bundler module resolution

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
