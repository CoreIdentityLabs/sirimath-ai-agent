# sirimath-ai-agent Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-29

## Active Technologies
- TypeScript 5.x, Node.js ≥ 20 (LTS); ESM modules + `@voltagent/core` ^2.0.0, `@voltagent/voice` ^2.1.0, `grammy` ^1.x, Vercel AI SDK v6 provider packages (existing) (003-telegram-voice-stt-tts)
- LibSQL/SQLite via `@voltagent/libsql` (existing — memory + observability; no new storage needed for voice) (003-telegram-voice-stt-tts)
- TypeScript 5.x, strict mode — Node.js ≥ 20 (LTS) + `@ai-sdk/openai-compatible` (new), `ai` v6 (existing), `@voltagent/core` ^2 (existing) (004-lmstudio-provider)
- N/A — no storage changes (004-lmstudio-provider)

- TypeScript 5.x, Node.js ≥ 20 (LTS); ESM modules + `@voltagent/core` ^2.0.0, `@voltagent/server-hono` ^2.0.0, `@voltagent/libsql` ^2.0.0, `grammy` ^1.x (Telegram Bot API), Vercel AI SDK v6 provider packages (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/azure`, `@ai-sdk/groq`, `@ai-sdk/mistral`, `ollama-ai-provider-v2`) (001-telegram-byok-assistant)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x, Node.js ≥ 20 (LTS); ESM modules: Follow standard conventions

## Recent Changes
- 004-lmstudio-provider: Added TypeScript 5.x, strict mode — Node.js ≥ 20 (LTS) + `@ai-sdk/openai-compatible` (new), `ai` v6 (existing), `@voltagent/core` ^2 (existing)
- 003-telegram-voice-stt-tts: Added TypeScript 5.x, Node.js ≥ 20 (LTS); ESM modules + `@voltagent/core` ^2.0.0, `@voltagent/voice` ^2.1.0, `grammy` ^1.x, Vercel AI SDK v6 provider packages (existing)

- 001-telegram-byok-assistant: Added TypeScript 5.x, Node.js ≥ 20 (LTS); ESM modules + `@voltagent/core` ^2.0.0, `@voltagent/server-hono` ^2.0.0, `@voltagent/libsql` ^2.0.0, `grammy` ^1.x (Telegram Bot API), Vercel AI SDK v6 provider packages (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/azure`, `@ai-sdk/groq`, `@ai-sdk/mistral`, `ollama-ai-provider-v2`)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
