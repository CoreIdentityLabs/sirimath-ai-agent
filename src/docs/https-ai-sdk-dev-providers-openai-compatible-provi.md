# LM Studio Provider — Vercel AI SDK

> **Source**: https://ai-sdk.dev/providers/openai-compatible-providers/lmstudio  
> **Research date**: 2026-04-29

---

## Executive Summary

The Vercel AI SDK integrates with **LM Studio** — a desktop application for running local LLMs — by treating its built-in OpenAI-compatible HTTP server as any other OpenAI-compatible provider. Integration is done entirely through the `@ai-sdk/openai-compatible` npm package using the `createOpenAICompatible` factory function, pointed at `http://localhost:1234/v1`. No API key is required. The SDK supports text generation, streaming, and batch embeddings out of the box. LM Studio itself must be running with its local server started before any SDK calls are made.

---

## Architecture Overview

```
┌──────────────────────────────┐
│   Your TypeScript/JS App     │
│                              │
│  import { createOpenAI      │
│    Compatible } from         │
│    '@ai-sdk/openai-compat'   │
│                              │
│  import { generateText,      │
│    streamText, embed,        │
│    embedMany } from 'ai'     │
└──────────────┬───────────────┘
               │  HTTP POST /v1/chat/completions
               │  HTTP POST /v1/embeddings
               ▼
┌──────────────────────────────┐
│   LM Studio Local Server     │
│   http://localhost:1234/v1   │
│                              │
│  OpenAI-compatible REST API  │
│  (started via LM Studio UI,  │
│   "Local Server" tab)        │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   Locally downloaded model   │
│   e.g. llama-3.2-1b,         │
│   bartowski/gemma-2-9b-it,   │
│   text-embedding-nomic-*     │
└──────────────────────────────┘
```

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| Node.js | `>=18` (per `package.json` `engines` field)[^1] |
| LM Studio desktop app | Download from https://lmstudio.ai — runs on macOS, Windows, Linux |
| Local server started | Must click "Start Server" in LM Studio's **Local Server** tab |
| Model downloaded | Each model must be downloaded first inside LM Studio before calling it |
| Package installed | `@ai-sdk/openai-compatible` (also needs the `ai` core package) |

---

## Setup

Install the package with your package manager of choice:

```bash
# pnpm
pnpm add @ai-sdk/openai-compatible

# npm
npm install @ai-sdk/openai-compatible

# yarn
yarn add @ai-sdk/openai-compatible

# bun
bun add @ai-sdk/openai-compatible
```

Source: [`content/providers/02-openai-compatible-providers/30-lmstudio.mdx`](https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/content/providers/02-openai-compatible-providers/30-lmstudio.mdx)[^2]

---

## Provider Instance

Create a provider instance with `createOpenAICompatible`, pointing `baseURL` at LM Studio's default local server address:

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: 'http://localhost:1234/v1',
  // No apiKey needed — server is local and unauthenticated by default
});
```

- **Port 1234** is the default. It can be changed in LM Studio's Local Server settings.[^2]
- The `name` field sets the provider identifier prefix used in model tags (e.g., `lmstudio.chat`).[^3]
- No `apiKey` is required because LM Studio's local server does not enforce authentication by default.

Internally, `createOpenAICompatible` constructs URLs as `${baseURL}${path}` (e.g., `/v1/chat/completions`), applies optional query params, and attaches a `User-Agent` header with the SDK version.[^3]

---

## Language Models

### Creating a Model

Instantiate a language model with the model ID that matches the one loaded in LM Studio:

```ts
const model = lmstudio('llama-3.2-1b');
// Equivalent:
const model = lmstudio.chatModel('llama-3.2-1b');
const model = lmstudio.languageModel('llama-3.2-1b');
```

The model ID must match exactly what LM Studio shows as the loaded model name.[^2]

### Text Generation (`generateText`)

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: 'http://localhost:1234/v1',
});

const { text } = await generateText({
  model: lmstudio('llama-3.2-1b'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
  maxRetries: 1, // immediately error if the server is not running
});
```

**Tip**: Set `maxRetries: 1` to fail fast when the LM Studio server isn't running, rather than waiting through multiple retry attempts.[^2]

### Streaming Text (`streamText`)

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: 'http://localhost:1234/v1',
});

const result = streamText({
  model: lmstudio('bartowski/gemma-2-9b-it-GGUF'),
  prompt: 'Invent a new holiday and describe its traditions.',
  maxRetries: 1,
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}

console.log('Token usage:', await result.usage);
console.log('Finish reason:', await result.finishReason);
```

Source: [`examples/ai-functions/src/stream-text/lmstudio/basic.ts`](https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/examples/ai-functions/src/stream-text/lmstudio/basic.ts)[^4]

---

## Embedding Models

LM Studio also exposes an embeddings endpoint (`/v1/embeddings`). Use the `.embeddingModel()` factory to target it.

### Single Value Embedding

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embed } from 'ai';

const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: 'http://localhost:1234/v1',
});

// Returns a single number[] vector
const { embedding } = await embed({
  model: lmstudio.embeddingModel('text-embedding-nomic-embed-text-v1.5'),
  value: 'sunny day at the beach',
});
```

### Batch Embedding (`embedMany`)

Especially useful for RAG pipelines where many documents need to be indexed:

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embedMany } from 'ai';

const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: 'http://localhost:1234/v1',
});

// Returns number[][] sorted in same order as input values
const { embeddings } = await embedMany({
  model: lmstudio.embeddingModel('text-embedding-nomic-embed-text-v1.5'),
  values: [
    'sunny day at the beach',
    'rainy afternoon in the city',
    'snowy night in the mountains',
  ],
});
```

Mentioned embedding models compatible with LM Studio:[^2]
- `text-embedding-nomic-embed-text-v1.5`
- `text-embedding-bge-small-en-v1.5`

---

## How It Works Internally

### `@ai-sdk/openai-compatible` Package

- **Current version**: `3.0.0-beta.33`[^1]
- **License**: Apache-2.0
- **ESM-only**: `"type": "module"`, `"sideEffects": false`
- **Peer dependency**: `zod ^3.25.76 || ^4.1.8`

The `createOpenAICompatible` function (in [`packages/openai-compatible/src/openai-compatible-provider.ts`](https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/packages/openai-compatible/src/openai-compatible-provider.ts)) returns a provider object with these factory methods:[^3]

| Method | Returns | Description |
|--------|---------|-------------|
| `provider(modelId)` | `LanguageModelV4` | Default call — creates a chat model |
| `provider.languageModel(modelId)` | `LanguageModelV4` | Alias for chat model |
| `provider.chatModel(modelId)` | `LanguageModelV4` | Chat completions (`/v1/chat/completions`) |
| `provider.completionModel(modelId)` | `LanguageModelV4` | Legacy text completions (`/v1/completions`) |
| `provider.embeddingModel(modelId)` | `EmbeddingModelV4` | Text embeddings (`/v1/embeddings`) |
| `provider.imageModel(modelId)` | `ImageModelV4` | Image generation (`/v1/images/generations`) |

### Provider Settings Reference

All optional settings for `createOpenAICompatible`:

| Setting | Type | Purpose |
|---------|------|---------|
| `baseURL` | `string` | **(Required)** Base URL for all API calls |
| `name` | `string` | **(Required)** Provider name prefix |
| `apiKey` | `string` | Adds `Authorization: Bearer <key>` header |
| `headers` | `Record<string, string>` | Additional custom headers |
| `queryParams` | `Record<string, string>` | Custom URL query parameters |
| `fetch` | `FetchFunction` | Custom fetch implementation (e.g. for testing/proxying) |
| `includeUsage` | `boolean` | Include usage stats in streaming responses |
| `supportsStructuredOutputs` | `boolean` | Enable JSON schema-constrained outputs |
| `transformRequestBody` | `(body) => body` | Modify request body before sending |
| `metadataExtractor` | `MetadataExtractor` | Extract provider-specific metadata from responses |

Source: [`openai-compatible-provider.ts:44-94`](https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/packages/openai-compatible/src/openai-compatible-provider.ts)[^3]

### Per-Model Chat Options

The following per-call options are available via `providerOptions` for chat models:[^5]

```ts
{
  user?: string;          // End-user ID for abuse monitoring
  reasoningEffort?: string; // e.g. 'low', 'medium', 'high'
  textVerbosity?: string;   // Controls output verbosity
  strictJsonSchema?: boolean; // Constrained decoding for JSON schemas (default: true)
}
```

### MetadataExtractor API

For custom providers built on top of this package, you can extract non-standard fields from responses:[^6]

```ts
type MetadataExtractor = {
  extractMetadata: ({ parsedBody }) => Promise<SharedV4ProviderMetadata | undefined>;
  createStreamExtractor: () => {
    processChunk(parsedChunk: unknown): void;
    buildMetadata(): SharedV4ProviderMetadata | undefined;
  };
};
```

---

## TypeScript: Model ID Auto-Completion

For typed model IDs with IDE auto-complete while still allowing arbitrary strings:

```ts
type LMStudioChatModelIds =
  | 'llama-3.2-1b'
  | 'bartowski/gemma-2-9b-it-GGUF'
  | (string & {}); // allows any string but shows above as completions

const lmstudio = createOpenAICompatible<LMStudioChatModelIds, never, string, never>({
  name: 'lmstudio',
  baseURL: 'http://localhost:1234/v1',
});
```

---

## Supported Capabilities

LM Studio language models (via this provider) support:[^7]

| Capability | Supported |
|------------|-----------|
| Text generation | ✅ |
| Streaming | ✅ |
| Tool/function calling | ✅ (model-dependent) |
| Structured outputs (JSON schema) | ✅ (when `supportsStructuredOutputs: true`) |
| Reasoning tokens | ✅ (for models that return them, e.g. DeepSeek R1) |
| System messages | ✅ |
| Multi-modal inputs | ✅ (provider-dependent, model must support it) |
| Embeddings | ✅ |
| Image generation | ✅ (via `.imageModel()`, model must support it) |

---

## Key Repositories Summary

| Repository | Purpose | Key Files |
|------------|---------|-----------|
| [`vercel/ai`](https://github.com/vercel/ai) | AI SDK monorepo | `packages/openai-compatible/` |
| [`vercel/ai` – docs source](https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/content/providers/02-openai-compatible-providers/30-lmstudio.mdx) | LM Studio doc page | MDX documentation |
| [`vercel/ai` – example](https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/examples/ai-functions/src/stream-text/lmstudio/basic.ts) | Stream text example | `basic.ts` |
| [npmjs `@ai-sdk/openai-compatible`](https://www.npmjs.com/package/@ai-sdk/openai-compatible) | Published package | — |

---

## Common Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| Connection refused | LM Studio server not running | Open LM Studio → Local Server tab → click "Start Server" |
| Model not found | Model ID mismatch or not loaded | Check model name in LM Studio; ensure model is loaded |
| Hangs on retry | Default `maxRetries: 2` waits 3 attempts | Set `maxRetries: 1` in `generateText`/`streamText` options |
| HTTPS error | Example code uses `https://localhost:...` | Use `http://localhost:1234/v1` (LM Studio server is plain HTTP) |

> **Note**: The official docs contain a minor inconsistency — the setup section shows `http://localhost:1234/v1` (correct), but some examples use `https://localhost:1234/v1`. LM Studio's local server is plain HTTP by default.[^2]

---

## Confidence Assessment

| Finding | Confidence | Basis |
|---------|-----------|-------|
| Package name and install command | High | Official docs + GitHub source |
| Default base URL `http://localhost:1234/v1` | High | Multiple sources consistent |
| Provider settings API | High | Verified in `openai-compatible-provider.ts` source |
| Supported model types (chat, embedding, image) | High | Source code `index.ts` exports |
| LM Studio requires no API key | High | Explicit in docs; no `apiKey` shown in LM Studio examples |
| Chat options (`reasoningEffort`, etc.) | High | Verified in `openai-compatible-chat-options.ts` |
| `https://` vs `http://` inconsistency | Medium | Observed in docs; LM Studio server is HTTP per general knowledge |
| Tool calling support | Medium | Listed as capability but LM Studio model-specific behavior not fully documented |

---

## Footnotes

[^1]: `packages/openai-compatible/package.json` — version `3.0.0-beta.33`, engines `>=18`, Apache-2.0 license: https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/packages/openai-compatible/package.json

[^2]: `content/providers/02-openai-compatible-providers/30-lmstudio.mdx` (SHA: 8f844951): https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/content/providers/02-openai-compatible-providers/30-lmstudio.mdx

[^3]: `packages/openai-compatible/src/openai-compatible-provider.ts` (SHA: 5477ca64) — `createOpenAICompatible` function, provider settings interface, factory methods: https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/packages/openai-compatible/src/openai-compatible-provider.ts

[^4]: `examples/ai-functions/src/stream-text/lmstudio/basic.ts` (SHA: 11d767f8) — streamText example with `bartowski/gemma-2-9b-it-GGUF`: https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/examples/ai-functions/src/stream-text/lmstudio/basic.ts

[^5]: `packages/openai-compatible/src/chat/openai-compatible-chat-options.ts` (SHA: 035ef5a0) — per-call provider options schema: https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/packages/openai-compatible/src/chat/openai-compatible-chat-options.ts

[^6]: `packages/openai-compatible/src/chat/openai-compatible-metadata-extractor.ts` (SHA: 158d84bd) — MetadataExtractor type: https://github.com/vercel/ai/blob/f2a1260eff5ff02b10a600ea7df7eb6193d05ec4/packages/openai-compatible/src/chat/openai-compatible-metadata-extractor.ts

[^7]: `https://ai-sdk.dev/providers/openai-compatible-providers` — Supported Capabilities section for OpenAI-compatible chat models
