# Implementation Plan: Telegram Voice Messages — STT & TTS

**Branch**: `003-telegram-voice-stt-tts` | **Date**: 2026-03-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-telegram-voice-stt-tts/spec.md`

## Summary

Extend the existing Telegram channel adapter to handle incoming voice messages (and audio files) by transcribing them via STT, processing the transcribed text through the VoltAgent agent, and replying with both a TTS-generated voice message and a text follow-up. Voice features are opt-in via the `VOICE_PROVIDER` environment variable — when unset, the existing text-only fallback behavior is preserved. Two voice providers are supported at launch: OpenAI (via `@voltagent/voice`'s `OpenAIVoiceProvider`) and Azure OpenAI (via a thin `AzureVoiceProvider` that uses the `openai` npm package's `AzureOpenAI` client). All voice protocol handling stays inside `src/channels/telegram.ts` and voice provider initialization in a new `src/config/voice-provider.ts` module.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 20 (LTS); ESM modules  
**Primary Dependencies**: `@voltagent/core` ^2.0.0, `@voltagent/voice` ^2.1.0 (includes `openai` ^4.91.0 with `AzureOpenAI` class), `grammy` ^1.x, Vercel AI SDK v6 provider packages (existing)  
**Storage**: LibSQL/SQLite via `@voltagent/libsql` (existing — memory + observability; no new storage needed for voice)  
**Testing**: Manual integration testing via Telegram bot; unit tests deferred (consistent with 001 feature approach)  
**Target Platform**: Linux server (Docker), macOS local dev  
**Project Type**: Agent service (long-running process — Hono HTTP server + Telegram bot)  
**Performance Goals**: Voice round-trip (STT + agent + TTS) under 15 seconds for messages ≤ 30s; STT alone under 5 seconds  
**Constraints**: Telegram voice file download limit 20 MB; Telegram voice send limit 50 MB; OGG/Opus format for voice notes  
**Scale/Scope**: Single-user personal assistant; single agent; voice as additional input/output modality; 2 voice providers (OpenAI, Azure)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Gate                                                                   | Principle                      | Outcome                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent-First: feature exposed via a VoltAgent agent                     | I. Agent-First Design          | ✅ Voice messages are transcribed and routed through `agent.generateText()` — same as text messages                                                                                         |
| All new code in TypeScript strict; Zod schemas for tool/workflow I/O   | II. Type Safety                | ✅ All new code in TypeScript strict mode; no new tools or workflows requiring Zod schemas (voice is a channel concern, not a tool)                                                         |
| New capabilities as `createTool` with typed input/output               | III. Tool-Driven Extensibility | N/A Voice processing is a channel-layer concern (input/output modality), not a new agent capability. No tool needed.                                                                        |
| Observability adapter configured; structured logging only              | IV. Observability-First        | ✅ Existing observability preserved; all new logging via structured `logger` (Pino); no `console.log`                                                                                       |
| No speculative abstractions; complexity justified                      | V. Simplicity & YAGNI          | ✅ Single `resolveVoiceProvider()` function + voice handler in `telegram.ts`; Azure provider is a thin class (~60 lines) reusing existing `BaseVoiceProvider` — no abstract voice framework |
| Model via env vars; no hardcoded provider; Azure AI Foundry supported  | VI. Multi-Provider / BYOK      | ✅ Voice provider configurable via `VOICE_PROVIDER` env var (`openai` or `azure`); LLM provider selection unchanged; Azure voice reuses same credentials as Azure LLM                       |
| Channel code in `src/channels/`; agent logic channel-agnostic          | VII. Channel Abstraction       | ✅ Voice handling lives entirely in `src/channels/telegram.ts` and `src/config/voice-provider.ts`; agent remains voice-agnostic                                                             |
| Tech stack additions within allowed set (see Technology Stack section) | Technology Stack               | ✅ `@voltagent/voice` is a `@voltagent/*` package (within allowed set); no new frameworks                                                                                                   |

> All gates passed. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/003-telegram-voice-stt-tts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── voice-provider.md   # Voice provider contract
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── index.ts                 # Modified: pass voice provider to startTelegramBot
├── config/
│   ├── model-provider.ts    # Existing (unchanged)
│   └── voice-provider.ts    # NEW: resolveVoiceProvider() — OpenAI or Azure voice init
├── channels/
│   └── telegram.ts          # Modified: voice message handler, audio handler, TTS reply
├── voice/
│   └── azure-voice-provider.ts  # NEW: AzureVoiceProvider extending BaseVoiceProvider
├── tools/
│   └── ...                  # Existing (unchanged)
├── workflows/
│   └── ...                  # Existing (unchanged)
└── docs/
    └── ...                  # Existing (unchanged)
```

**Structure Decision**: Single project — extends the existing `src/` layout. Two new files: `src/config/voice-provider.ts` for voice provider resolution and `src/voice/azure-voice-provider.ts` for the Azure voice provider class. The Telegram adapter (`src/channels/telegram.ts`) is modified to add voice/audio message handlers.

## Complexity Tracking

> No violations — Constitution Check passed all gates.
