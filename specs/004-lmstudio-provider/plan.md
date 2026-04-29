# Implementation Plan: Add LM Studio Model Provider

**Branch**: `004-lmstudio-provider` | **Date**: 2026-04-29 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/004-lmstudio-provider/spec.md`

## Summary

Add LM Studio as a ninth model provider option in Sirimath AI, selectable via `MODEL_PROVIDER=lmstudio`. The change is entirely confined to the provider routing layer: one new dependency (`@ai-sdk/openai-compatible`), one new case in the `resolveModel()` switch, one new env var (`LMSTUDIO_BASE_URL`), and documentation updates. Zero changes to agent logic, tools, channels, or observability.

## Technical Context

**Language/Version**: TypeScript 5.x, strict mode — Node.js ≥ 20 (LTS)  
**Primary Dependencies**: `@ai-sdk/openai-compatible` (new), `ai` v6 (existing), `@voltagent/core` ^2 (existing)  
**Storage**: N/A — no storage changes  
**Testing**: Manual smoke test (LM Studio running locally); `npm run typecheck` + `npm run lint` for CI gates  
**Target Platform**: Same as existing — Linux/macOS/Windows server or desktop  
**Project Type**: AI agent service (VoltAgent)  
**Performance Goals**: Inherits from local model — no latency SLA added  
**Constraints**: LM Studio server must be externally running; no auth by default  
**Scale/Scope**: Single provider case addition — no scale impact

## Constitution Check

| Gate | Principle | Outcome |
| -------------------------------------------------------------------------------------------------------- | ------------------------------ | ------- |
| Agent-First: feature exposed via a VoltAgent agent | I. Agent-First Design | N/A — provider config only; agent is unchanged |
| All new code in TypeScript strict; Zod schemas for tool/workflow I/O | II. Type Safety | ✅ — `"lmstudio"` added to `SUPPORTED_PROVIDERS as const`; type inference flows automatically |
| New capabilities as `createTool` with typed input/output | III. Tool-Driven Extensibility | N/A — no new tools |
| Observability adapter configured; structured logging only | IV. Observability-First | N/A — no observability changes; existing traces continue to work unchanged |
| No speculative abstractions; complexity justified | V. Simplicity & YAGNI | ✅ — one switch case, one dependency, no new abstractions |
| Model via env vars; no hardcoded provider; Azure AI Foundry supported | VI. Multi-Provider / BYOK | ✅ ADVANCES — this PR directly extends the BYOK provider set |
| Channel code in `src/channels/`; agent logic channel-agnostic | VII. Channel Abstraction | N/A — no channel changes |
| Tech stack additions within allowed set | Technology Stack | ✅ — `@ai-sdk/openai-compatible` is part of the Vercel AI SDK v6 ecosystem already in the stack |

## Project Structure

### Documentation (this feature)

```text
specs/004-lmstudio-provider/
├── plan.md              ← this file
├── research.md          ← Phase 0 output (complete)
├── data-model.md        ← Phase 1 output (complete — N/A, no data model)
├── quickstart.md        ← Phase 1 output (complete)
└── tasks.md             ← Phase 2 output (/speckit.tasks — not yet created)
```

### Source Code Changes

```text
package.json                         ← add @ai-sdk/openai-compatible dependency
src/
└── config/
    └── model-provider.ts            ← add "lmstudio" provider case
.env.example                         ← add LM Studio section
README.md                            ← update supported providers table
```

## Implementation Design

### 1. Dependency — `package.json`

Add to `dependencies`:

```json
"@ai-sdk/openai-compatible": "^3.0.0"
```

Run `npm install` to lock the version.

**Version note**: The package is published as `3.0.0-beta.x` as of research date, aligned with the `ai` v6 / Vercel AI SDK v6 series already in use. Use `^3.0.0` to track the stable 3.x line once released; using `^3.0.0-beta.0` explicitly if needed until GA.

---

### 2. Provider Routing — `src/config/model-provider.ts`

**Two changes**:

#### a. Extend `SUPPORTED_PROVIDERS`

```typescript
export const SUPPORTED_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "azure",
  "groq",
  "mistral",
  "ollama",
  "lmstudio",   // ← add this
] as const;
```

This automatically extends the `ProviderName` type union — no separate type declaration needed.

#### b. Add `lmstudio` case to the switch

Insert after the `ollama` case:

```typescript
case "lmstudio": {
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const baseURL =
    process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1";
  const lmstudio = createOpenAICompatible({
    name: "lmstudio",
    baseURL,
  });
  return lmstudio(modelId);
}
```

**Design decisions reflected here**:
- No `apiKey` — LM Studio server is unauthenticated by default
- `LMSTUDIO_BASE_URL` env var allows overriding host/port without code changes
- Dynamic `import()` keeps the package optional at runtime (only loaded when `MODEL_PROVIDER=lmstudio`), matching the pattern of every other provider

---

### 3. Environment Documentation — `.env.example`

Add a new section after the Ollama block:

```env
# ─── LM Studio (Local Models) ──────────────────────────────
# No API key required. LM Studio must be running with its local server started.
# Install: https://lmstudio.ai
# Start server: LM Studio → Local Server tab → Start Server
# MODEL_PROVIDER=lmstudio
# MODEL_ID=llama-3.2-1b       # Use exact model ID from LM Studio UI
# Optional: override if LM Studio runs on a custom port or remote host
# LMSTUDIO_BASE_URL=http://localhost:1234/v1
```

---

### 4. README Update

In the "Supported Providers" section (or equivalent table), add:

| Provider | `MODEL_PROVIDER` value | Requires API Key | Notes |
|----------|----------------------|------------------|-------|
| LM Studio | `lmstudio` | No | Local model; requires LM Studio running with server started |

---

## Complexity Tracking

No constitution violations — no entries required.

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `@ai-sdk/openai-compatible` still in beta (`3.0.0-beta.x`) at time of implementation | Medium | Low | Pinning to `^3.0.0-beta.0` is acceptable; the API is stable per source review. Upgrade to GA when released. |
| LM Studio model tool-calling support is model-dependent | Medium | Low | Document in quickstart. VoltAgent's tools work best with models that support function calling (e.g. Llama 3, Gemma 2). |
| Streaming hang if LM Studio server is down mid-session | Low | Medium | No mitigation needed in provider code — VoltAgent and grammy handle disconnection at channel layer. Document in quickstart. |

