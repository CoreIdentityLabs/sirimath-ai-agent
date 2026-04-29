# Research: LM Studio Provider for Sirimath AI

**Feature**: 004-lmstudio-provider  
**Branch**: `004-lmstudio-provider`  
**Date**: 2026-04-29

---

## 1. Package Selection

**Decision**: Use `@ai-sdk/openai-compatible` (`npm: @ai-sdk/openai-compatible`)  
**Rationale**: LM Studio exposes an OpenAI-compatible REST API. The Vercel AI SDK provides a first-class `@ai-sdk/openai-compatible` package designed precisely for this case. It is part of the same `vercel/ai` monorepo and shares the same `LanguageModelV4` interface as every other provider already in use, meaning the integration is structurally identical to the existing Ollama case — one `createOpenAICompatible(...)` factory call returns a `LanguageModelV4`.  
**Alternatives considered**:
- Using `@ai-sdk/openai` with a custom `baseURL` override: technically works but is semantically wrong (conflates the OpenAI provider with the compatible shim) and can cause confusion with OpenAI-specific feature flags.
- Writing a raw fetch wrapper: unnecessary complexity; the existing package handles streaming, retries, error normalisation, and Zod schema outputs out of the box.

---

## 2. Base URL Configuration

**Decision**: Default `http://localhost:1234/v1`; override via `LMSTUDIO_BASE_URL` environment variable.  
**Rationale**: Port 1234 is LM Studio's documented default. The same pattern is already used for Ollama (`OLLAMA_BASE_URL`), making it immediately familiar to operators who have used that provider. Placing the override in an env var keeps the code zero-config for standard local usage and requires no code changes for non-standard setups.  
**Alternatives considered**:
- Hard-coding the base URL: rejected — violates VI. Multi-Provider / BYOK principle (no source-code changes for provider configuration).
- Using separate `LMSTUDIO_HOST` + `LMSTUDIO_PORT` variables: over-engineered; a single URL string is more flexible and matches the Ollama precedent.

---

## 3. Authentication

**Decision**: No API key required; `apiKey` is omitted from `createOpenAICompatible` options.  
**Rationale**: LM Studio's local server does not enforce authentication by default. Passing an empty key causes an unnecessary `Authorization: Bearer ` header. Future operators who do enable auth can extend this via `LMSTUDIO_API_KEY` in a follow-on; out of scope for the initial provider addition.

---

## 4. Default Model ID

**Decision**: No default model ID is forced for `lmstudio`; operators MUST supply `MODEL_ID`.  
**Rationale**: There is no universally installed default model — whatever the operator has downloaded in LM Studio varies. The global default `gpt-4o-mini` (in `resolveModel`) is only meaningful for the `openai` case. Failing clearly when `MODEL_ID` is absent is better than guessing a model name that may not exist.  
**Implementation note**: `MODEL_ID` is already required at the `resolveModel` call site for all providers; LM Studio inherits that behaviour.

---

## 5. Retry / Timeout Behaviour

**Decision**: Set no `maxRetries` override at the provider level; document `maxRetries: 1` in quickstart guidance for local testing.  
**Rationale**: The AI SDK's `generateText` / `streamText` functions accept `maxRetries` at the call site, not at provider creation. `resolveModel()` returns a `LanguageModelV4` and does not control retry policy. The Telegram channel and VoltAgent core own the call site. Documenting `maxRetries: 1` in the quickstart is the correct ergonomic: it tells developers testing locally to fail fast, without forcing it on production usage.

---

## 6. File Impact Analysis

| File | Change | Reason |
|------|--------|--------|
| `package.json` | Add `@ai-sdk/openai-compatible` dependency | New package required |
| `src/config/model-provider.ts` | Add `"lmstudio"` to `SUPPORTED_PROVIDERS` and switch case | Core routing change |
| `.env.example` | Add LM Studio section | Operator documentation |
| `README.md` | Add LM Studio to supported providers table | User-facing docs |

**No other files change.** The channel code (`src/channels/telegram`), agent definition (`src/index.ts`), tools, voice provider, and observability setup are all provider-agnostic by design.

---

## 7. Constitution Compliance Summary

| Principle | Status | Notes |
|-----------|--------|-------|
| VI. Multi-Provider / BYOK | ✅ ADVANCES | This PR directly fulfils the principle — adds a new provider configurable via `MODEL_PROVIDER=lmstudio` |
| II. Type Safety | ✅ PASS | `lmstudio` added to `SUPPORTED_PROVIDERS as const`; type flows through unchanged |
| V. Simplicity & YAGNI | ✅ PASS | One switch case, one dependency, zero new abstractions |
| All others | N/A | No agent, tool, channel, or observability changes |

---

## 8. Version Compatibility

- `@ai-sdk/openai-compatible` requires Node.js ≥ 18; project requires ≥ 20 ✅
- Package is ESM-only (`"type": "module"`) — matches project's `"type": "module"` ✅
- Peer dependency `zod ^3.25.76` — project already depends on `zod ^3.25.76` ✅
- `@ai-sdk/openai-compatible` v3.x aligns with the `ai` v6 major series already in use ✅
