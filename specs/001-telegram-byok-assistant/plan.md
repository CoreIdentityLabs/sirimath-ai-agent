# Implementation Plan: Telegram BYOK Personal Assistant with Skill Discovery

**Branch**: `001-telegram-byok-assistant` | **Date**: 2026-03-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-telegram-byok-assistant/spec.md`

## Summary

Build a Telegram-connected personal assistant on top of the existing VoltAgent application. The assistant accepts text messages via Telegram Bot API (using `grammy`), routes them through a VoltAgent `Agent` configured with a runtime-selected LLM provider (BYOK via Vercel AI SDK), and replies within the same Telegram chat. Conversation history is persisted via the existing LibSQL memory adapter. Two new tools — `findSkills` and `installSkill` — allow users to discover and install agent skills from the skills.sh ecosystem directly from the chat. The Telegram channel adapter is cleanly separated in `src/channels/telegram.ts` so the agent remains channel-agnostic.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥ 20 (LTS); ESM modules  
**Primary Dependencies**: `@voltagent/core` ^2.0.0, `@voltagent/server-hono` ^2.0.0, `@voltagent/libsql` ^2.0.0, `grammy` ^1.x (Telegram Bot API), Vercel AI SDK v6 provider packages (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/azure`, `@ai-sdk/groq`, `@ai-sdk/mistral`, `ollama-ai-provider-v2`)  
**Storage**: LibSQL/SQLite via `@voltagent/libsql` (existing — memory + observability)  
**Testing**: Manual integration testing via Telegram bot; unit tests deferred (YAGNI — no test framework in place yet)  
**Target Platform**: Linux server (Docker), macOS local dev  
**Project Type**: Agent service (long-running process — Hono HTTP server + Telegram bot)  
**Performance Goals**: Reply within 10 seconds (excluding LLM latency); skill search results within 15 seconds  
**Constraints**: Single active LLM provider at a time; Telegram message limit 4096 chars  
**Scale/Scope**: Single-user personal assistant; single agent; 7 LLM providers

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Gate                                                                   | Principle                      | Outcome                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Agent-First: feature exposed via a VoltAgent agent                     | I. Agent-First Design          | ✅ All Telegram messages routed through `agent.generateText()`                                     |
| All new code in TypeScript strict; Zod schemas for tool/workflow I/O   | II. Type Safety                | ✅ `tsconfig.json` has `strict: true`; all tools use Zod schemas                                   |
| New capabilities as `createTool` with typed input/output               | III. Tool-Driven Extensibility | ✅ `findSkills` and `installSkill` implemented via `createTool`                                    |
| Observability adapter configured; structured logging only              | IV. Observability-First        | ✅ Existing `VoltAgentObservability` + `LibSQLObservabilityAdapter` + `createPinoLogger` preserved |
| No speculative abstractions; complexity justified                      | V. Simplicity & YAGNI          | ✅ Minimal new modules; no abstract "channel framework" — just one `telegram.ts` file              |
| Model via env vars; no hardcoded provider; Azure AI Foundry supported  | VI. Multi-Provider / BYOK      | ✅ `resolveModel()` reads `MODEL_PROVIDER` + `MODEL_ID` env vars; Azure via `@ai-sdk/azure`        |
| Channel code in `src/channels/`; agent logic channel-agnostic          | VII. Channel Abstraction       | ✅ Telegram adapter in `src/channels/telegram.ts`; agent in `src/index.ts` unchanged               |
| Tech stack additions within allowed set (see Technology Stack section) | Technology Stack               | ✅ `grammy` + AI SDK provider packages all listed in constitution                                  |

## Project Structure

### Documentation (this feature)

```text
specs/001-telegram-byok-assistant/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (Telegram adapter contract)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── index.ts                 # VoltAgent bootstrap (modified: dynamic model, tools, Telegram start)
├── config/
│   └── model-provider.ts    # resolveModel() — BYOK provider factory
├── channels/
│   └── telegram.ts          # Telegram Bot adapter (grammy)
├── tools/
│   ├── index.ts             # Tool barrel export (modified: add skill tools)
│   ├── weather.ts           # Existing weather tool (unchanged)
│   ├── find-skills.ts       # findSkills tool — search skills.sh API
│   └── install-skill.ts     # installSkill tool — fetch, validate, install skill
├── workflows/
│   └── index.ts             # Existing workflows (unchanged)
└── docs/
    └── ...                  # Existing docs (unchanged)

.env.example                 # New: documents all required/optional env vars
```

**Structure Decision**: Single project (Option 1) — the existing `src/` layout is extended with `src/config/` for provider resolution and `src/channels/` for Telegram. No new top-level projects needed.

## Complexity Tracking

> No violations — Constitution Check passed all gates.
