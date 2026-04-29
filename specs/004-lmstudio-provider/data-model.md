# Data Model: LM Studio Provider

**Feature**: 004-lmstudio-provider  
**Date**: 2026-04-29

---

## Assessment

This feature introduces **no new data entities, no schema changes, and no new persistence requirements**.

LM Studio is a runtime provider that replaces the LLM call target. It is wired in at application startup through the `resolveModel()` function which returns a `LanguageModelV4` interface. The rest of the application — memory, observability, tools, channel adapters — remains entirely unchanged.

---

## Affected Configuration Values (Environment Variables)

These are operator-supplied runtime values, not persisted entities:

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `MODEL_PROVIDER` | `string` | Yes (global) | `"openai"` | Set to `"lmstudio"` to enable this provider |
| `MODEL_ID` | `string` | Yes | `"gpt-4o-mini"` (global) | Model ID as shown in LM Studio (e.g. `llama-3.2-1b`) |
| `LMSTUDIO_BASE_URL` | `string` | No | `"http://localhost:1234/v1"` | Override LM Studio server URL |

---

## Type Extension in Source Code

The only type change is adding `"lmstudio"` to the `SUPPORTED_PROVIDERS` const tuple in `src/config/model-provider.ts`:

```
SUPPORTED_PROVIDERS = ["openai", "anthropic", "google", "azure", "groq", "mistral", "ollama", "lmstudio"]
```

The `ProviderName` union type is derived from this tuple via `(typeof SUPPORTED_PROVIDERS)[number]`, so adding the string to the tuple automatically extends the type — no separate type declaration needed.

---

## No Contracts Needed

LM Studio does not introduce any new external interfaces exposed by Sirimath AI. The provider is an inbound dependency (Sirimath AI calls LM Studio), not an outbound contract (Sirimath AI exposes nothing new to callers). The existing Telegram channel and VoltAgent HTTP server contracts are unchanged.
