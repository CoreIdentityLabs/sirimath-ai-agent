# Contract: BYOK Model Provider

**Module**: `src/config/model-provider.ts`  
**Type**: Internal module interface  
**Date**: 2026-03-16

---

## Purpose

Resolves the LLM provider and model at startup from environment variables. Returns a Vercel AI SDK `LanguageModel` instance ready for use with `Agent`.

## Exported Interface

### `resolveModel(): Promise<LanguageModel>`

Reads `MODEL_PROVIDER` and `MODEL_ID` from environment, dynamically imports the corresponding `@ai-sdk/*` provider package, and returns a configured `LanguageModel`.

**Signature**:

```typescript
import type { LanguageModel } from "ai";

export async function resolveModel(): Promise<LanguageModel>;
```

**Parameters**: None (reads from `process.env`).

**Returns**: `Promise<LanguageModel>` — the resolved model instance.

**Error Behavior**:

- Unsupported `MODEL_PROVIDER` → logs supported providers + `process.exit(1)`
- Missing required env vars for provider (e.g., `AZURE_RESOURCE_NAME` for Azure) → logs specific error + `process.exit(1)`
- Provider package not installed → Node.js import error (caught by caller or crashes startup)

---

## Provider Map

| `MODEL_PROVIDER`   | Package                 | Factory              | Required Env Vars                      |
| ------------------ | ----------------------- | -------------------- | -------------------------------------- |
| `openai` (default) | `@ai-sdk/openai`        | `openai(modelId)`    | `OPENAI_API_KEY`                       |
| `anthropic`        | `@ai-sdk/anthropic`     | `anthropic(modelId)` | `ANTHROPIC_API_KEY`                    |
| `google`           | `@ai-sdk/google`        | `google(modelId)`    | `GOOGLE_GENERATIVE_AI_API_KEY`         |
| `azure`            | `@ai-sdk/azure`         | `azure(modelId)`     | `AZURE_API_KEY`, `AZURE_RESOURCE_NAME` |
| `groq`             | `@ai-sdk/groq`          | `groq(modelId)`      | `GROQ_API_KEY`                         |
| `mistral`          | `@ai-sdk/mistral`       | `mistral(modelId)`   | `MISTRAL_API_KEY`                      |
| `ollama`           | `ollama-ai-provider-v2` | `ollama(modelId)`    | (none)                                 |

## Defaults

- `MODEL_PROVIDER` → `"openai"`
- `MODEL_ID` → `"gpt-4o-mini"`

## Type Export

```typescript
export const SUPPORTED_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "azure",
  "groq",
  "mistral",
  "ollama",
] as const;

export type ProviderName = (typeof SUPPORTED_PROVIDERS)[number];
```
