# VoltAgent: Comprehensive Technical Deep-Dive

## Executive Summary

VoltAgent is an open-source, MIT-licensed **AI Agent Engineering Platform** built in TypeScript. It provides a modular monorepo of ~30 npm packages under the `@voltagent/*` namespace for building production-grade AI agents with memory, tools, workflows, guardrails, RAG, voice, and multi-agent orchestration[^1]. The framework is built directly on top of the **Vercel AI SDK** (`ai` v6+), which gives it instant compatibility with 20+ LLM providers (OpenAI, Anthropic, Google, Groq, Mistral, Ollama, etc.) without requiring custom provider adapters[^2]. A companion **VoltOps Console** (cloud or self-hosted) provides observability, deployment, prompt management, and evaluation capabilities[^3]. The current core package version is **2.6.9**[^4], indicating a mature and actively developed project.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           VoltAgent Platform                             │
├───────────────────────────────────┬──────────────────────────────────────┤
│  Open-Source TypeScript Framework  │       VoltOps Console (Cloud/SH)    │
│                                   │                                      │
│  ┌─────────────┐                  │  ┌──────────────────────────────┐    │
│  │ @voltagent/  │  ┌───────────┐  │  │  Observability & Tracing     │    │
│  │    core      │──│  Agent    │  │  │  Dashboard & Metrics         │    │
│  │  (v2.6.9)   │  │  Engine   │  │  │  Prompt Builder              │    │
│  └──────┬───┬──┘  └───────────┘  │  │  Evals & Guardrails          │    │
│         │   │                     │  │  Deployment (GitHub CI)       │    │
│         │   │  ┌───────────────┐  │  │  Memory Explorer             │    │
│         │   ├──│  Workflow     │  │  │  Triggers & Actions          │    │
│         │   │  │  Engine       │  │  │  RAG Knowledge Base          │    │
│         │   │  └───────────────┘  │  └──────────────────────────────┘    │
│         │   │                     │                                      │
│         │   │  ┌───────────────┐  │         ┌───────────────────┐        │
│         │   ├──│  Memory       │──┼────────▶│  OTLP Telemetry   │        │
│         │   │  │  System       │  │         │  (OpenTelemetry)   │        │
│         │   │  └───────────────┘  │         └───────────────────┘        │
│         │   │                     │                                      │
│  ┌──────┴───┴──────────────────┐  │                                      │
│  │  Server Layer               │  │                                      │
│  │  @voltagent/server-core     │  │                                      │
│  │  @voltagent/server-hono     │  │                                      │
│  │  @voltagent/serverless-hono │  │                                      │
│  └─────────────────────────────┘  │                                      │
├───────────────────────────────────┴──────────────────────────────────────┤
│                    Vercel AI SDK v6 (Foundation Layer)                    │
├──────────────────────────────────────────────────────────────────────────┤
│  OpenAI │ Anthropic │ Google │ Groq │ Mistral │ Ollama │ AWS Bedrock │…  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Monorepo Structure

The repository at [VoltAgent/voltagent](https://github.com/VoltAgent/voltagent) uses **pnpm workspaces** + **Lerna** + **Nx** for builds, with **Biome** for linting and **Vitest** for testing[^5]. It contains ~30 packages and 73 examples[^6].

---

## Core Package (`@voltagent/core`)

The heart of the framework. Current version: **2.6.9**[^4].

### Source Layout

```
packages/core/src/
├── agent/             # Agent class, hooks, guardrails, subagent, providers
├── a2a/               # Agent-to-Agent protocol support
├── eval/              # Evaluation runtime
├── events/            # Event type definitions
├── logger/            # LoggerProxy, global logger
├── mcp/               # MCP client (MCPConfiguration, MCPServerRegistry)
├── memory/            # Memory class, storage/vector/embedding adapters
├── observability/     # OpenTelemetry-based tracing & logging
├── planagent/         # PlanAgent (plan-then-execute pattern)
├── registries/        # AgentRegistry, ModelProviderRegistry
├── retriever/         # BaseRetriever for RAG
├── tool/              # createTool, toolkit, routing, reasoning tools
├── triggers/          # Trigger DSL, registry, catalog
├── utils/             # Helpers, tool parser, usage converter
├── voice/             # Voice provider interfaces
├── voltops/           # VoltOps client for telemetry & prompt mgmt
├── workflow/          # Workflow engine (chain, core, stream, steps)
├── workspace/         # File-aware agent workspaces
├── voltagent.ts       # Main VoltAgent bootstrap class
├── types.ts           # Core type definitions
└── index.ts           # Public API exports (~250 exports)
```
[^7]

### The `VoltAgent` Bootstrap Class

The `VoltAgent` class in `packages/core/src/voltagent.ts` is the entry point for any application[^8]. It:

1. Accepts `VoltAgentOptions` containing agents, workflows, server, memory, observability, triggers, MCP/A2A servers, etc.
2. Registers agents in an `AgentRegistry` and workflows in a `WorkflowRegistry`.
3. Bootstraps a server provider (e.g., Hono) by passing `ServerProviderDeps`.
4. Sets up OpenTelemetry-based observability.
5. Handles graceful shutdown (SIGINT/SIGTERM) with ordered cleanup: server → workflows → telemetry[^9].

```typescript
// Minimal bootstrap
import { VoltAgent, Agent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";
import { openai } from "@ai-sdk/openai";

const agent = new Agent({
  name: "my-agent",
  instructions: "A helpful assistant",
  model: openai("gpt-4o-mini"),
});

new VoltAgent({
  agents: { agent },
  server: honoServer(),
});
```
[^1]

### `VoltAgentOptions` Type

The options type in `packages/core/src/types.ts` reveals the full configuration surface[^10]:

| Option | Type | Purpose |
|--------|------|---------|
| `agents` | `Record<string, Agent>` | Agents to register |
| `workflows` | `Record<string, Workflow \| WorkflowChain>` | Workflow definitions |
| `memory` | `Memory` | Default memory for agents/workflows |
| `agentMemory` / `workflowMemory` | `Memory` | Scoped memory defaults |
| `toolRouting` | `ToolRoutingConfig` | Global tool search/call routing |
| `triggers` | `VoltAgentTriggersConfig` | VoltOps trigger handlers |
| `server` | `ServerProviderFactory` | HTTP server factory (e.g., `honoServer()`) |
| `serverless` | `ServerlessProviderFactory` | For Cloudflare Workers, Vercel Edge, Deno |
| `voltOpsClient` | `VoltOpsClient` | Telemetry + prompt management |
| `observability` | `VoltAgentObservability` | OpenTelemetry tracing |
| `mcpServers` | `Record<string, MCPServerLike>` | Expose agents as MCP servers |
| `a2aServers` | `Record<string, A2AServerLike>` | Expose agents via A2A protocol |
| `workspace` | `Workspace \| WorkspaceConfig` | File-aware workspace for agents |

---

## Agent System

### Agent Class

The `Agent` class (`packages/core/src/agent/agent.ts`) wraps a language model with instructions, tools, memory, and capabilities[^11]. Key methods:

- **`generateText(prompt, options)`** – Single-shot text generation with tool calls
- **`streamText(prompt, options)`** – Streaming text generation  
- **`generateObject(prompt, options)`** – Structured object generation with Zod schema
- **`streamObject(prompt, options)`** – Streaming structured output

All methods accept `userId`, `conversationId`, `tools`, `context`, `guardrails`, `elicitation`, and `semanticMemory` options[^11].

### Agent Configuration

```typescript
const agent = new Agent({
  name: "my-agent",
  instructions: "You are a helpful assistant",      // System prompt
  model: openai("gpt-4o-mini"),                     // Any AI SDK LanguageModel
  tools: [weatherTool, searchTool],                  // Zod-typed tools
  memory: new Memory({ storage: adapter }),           // Conversation persistence
  subAgents: [researchAgent, writingAgent],           // Multi-agent delegation
  retriever: myRetriever,                            // RAG retriever
  voice: new OpenAIVoiceProvider({...}),             // TTS/STT
  inputGuardrails: [piiGuardrail],                   // Input validation
  outputGuardrails: [profanityGuardrail],            // Output validation
  hooks: { onStart, onEnd, onToolCall },             // Lifecycle hooks
});
```
[^11]

### Sub-Agents & Supervisor Pattern

VoltAgent supports hierarchical multi-agent systems where a **supervisor agent** coordinates **sub-agents**[^12]. Sub-agents are defined using `createSubagent()` and can use different methods (`generateText`, `streamText`, `generateObject`, `streamObject`). The supervisor automatically gets tools to delegate to sub-agents:

```typescript
import { Agent, createSubagent } from "@voltagent/core";

const researchAgent = new Agent({ name: "researcher", ... });
const writerAgent = new Agent({ name: "writer", ... });

const supervisor = new Agent({
  name: "supervisor",
  instructions: "Coordinate research and writing tasks",
  model: openai("gpt-4o"),
  subAgents: [
    createSubagent({ agent: researchAgent, method: "generateText" }),
    createSubagent({ agent: writerAgent, method: "streamText" }),
  ],
});
```
[^12]

### PlanAgent

A specialized agent pattern at `packages/core/src/planagent/` that implements a plan-then-execute workflow[^13].

---

## Tool System

### Creating Tools

Tools are created with `createTool()` using Zod schemas for type-safe parameters[^14]:

```typescript
import { createTool } from "@voltagent/core";
import { z } from "zod";

const weatherTool = createTool({
  name: "getWeather",
  description: "Get current weather for a location",
  parameters: z.object({
    city: z.string().describe("City name"),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
  execute: async ({ city, unit }, { context }) => {
    return { temperature: 22, condition: "sunny" };
  },
});
```

### Tool Subsystem Structure

```
packages/core/src/tool/
├── index.ts           # createTool, tool types, exports
├── toolkit.ts         # createToolkit for grouping tools
├── manager/           # Tool lifecycle management
├── reasoning/         # Built-in think & analyze tools
└── routing/           # Tool routing (search + call patterns)
```
[^15]

### Tool Features

- **Lifecycle hooks**: `onStart`, `onComplete`, `onError` per tool[^14]
- **Cancellation**: Tools receive an `AbortSignal` for graceful cancellation[^16]
- **Client-side tools**: Tools can be executed on the client rather than server
- **Tool routing**: When enabled, agents get `searchTools`/`callTool` meta-tools that hide the individual tool pool from the LLM, reducing token usage[^10]
- **Reasoning tools**: Built-in `think` and `analyze` tools for chain-of-thought reasoning[^7]

---

## Memory System

### Architecture

The `Memory` class in `packages/core/src/memory/` manages conversation history, semantic search, and working memory[^17].

| Provider | Package | Persistence | Use Case |
|----------|---------|-------------|----------|
| InMemory | `@voltagent/core` | None (RAM) | Dev/testing |
| Managed Memory | `@voltagent/voltagent-memory` | VoltOps-hosted | Production, zero-setup |
| LibSQL | `@voltagent/libsql` | Local SQLite or remote | Self-hosted, edge |
| Postgres | `@voltagent/postgres` | Self-hosted Postgres | Existing Postgres infra |
| Supabase | `@voltagent/supabase` | Supabase | Supabase apps |
| Cloudflare D1 | `@voltagent/cloudflare-d1` | Cloudflare D1 | Edge workers |

[^17]

### Core Features

1. **Conversation Storage**: Messages scoped by `userId` + `conversationId`, auto-creates conversations, configurable message limits[^17]
2. **Conversation Steps**: Every LLM/tool step recorded with metadata (operationId, usage, tool args/results) for observability[^17]
3. **Semantic Search**: Optional embedding + vector adapters for content-based retrieval (not just recency)[^17]
4. **Working Memory**: Compact context across turns via markdown, Zod JSON schema, or free-form; scoped to `conversation` or `user`[^17]
5. **Workflow State**: Suspendable workflow checkpoint storage[^17]

### Custom Adapters

Implement the `StorageAdapter` interface with methods for messages, conversations, conversation steps, working memory, and workflow state. Adapters receive `OperationContext` for multi-tenancy and audit logging[^17].

---

## Workflow Engine

### Overview

The workflow engine (`packages/core/src/workflow/`) provides declarative, type-safe multi-step automation[^18]. The main implementation files:

| File | Size | Purpose |
|------|------|---------|
| `core.ts` | 141KB | Core workflow execution engine[^19] |
| `chain.ts` | 35KB | `WorkflowChain` builder API[^20] |
| `types.ts` | 31KB | Type definitions[^21] |
| `stream.ts` | 13KB | Streaming support[^22] |
| `registry.ts` | 14KB | Workflow registration & management[^23] |
| `suspend-controller.ts` | 1.8KB | Suspend/resume controller[^24] |

### Building Workflows

Workflows are built using `createWorkflowChain()` with a fluent builder API:

```typescript
import { createWorkflowChain } from "@voltagent/core";
import { z } from "zod";

const workflow = createWorkflowChain({
  id: "expense-approval",
  name: "Expense Approval",
  purpose: "Process expenses with approval",
  input: z.object({ amount: z.number(), category: z.string() }),
  result: z.object({ status: z.enum(["approved", "rejected"]) }),
})
  .andThen({ id: "validate", execute: async ({ data }) => { ... } })
  .andWhen({ condition: ({ data }) => data.amount > 500, ... })
  .andThen({ id: "process", execute: async ({ data }) => { ... } });
```
[^18]

### Step Types

| Step Method | Purpose |
|-------------|---------|
| `andThen` | Sequential step execution |
| `andAgent` | Delegate to an AI agent |
| `andAll` | Parallel execution of multiple branches |
| `andRace` | First-to-complete wins |
| `andWhen` | Conditional branching |
| `andTap` | Side-effect observation without modifying data |
| `andGuardrail` | Validation at workflow level |
| `andSleep` / `andSleepUntil` | Timed delays |
| `andForEach` | Iterate over collections |
| `andBranch` | Multi-path branching |
| `andDoWhile` / `andDoUntil` | Loop constructs |
| `andMap` | Transform data |
| `andWorkflow` | Compose sub-workflows |

[^7]

### Suspend & Resume

Workflows can be **suspended** mid-execution (e.g., waiting for human approval) and **resumed** later with data. This is implemented via `WorkflowSuspendController` and persisted to storage[^24]:

```typescript
.andThen({
  id: "approval",
  resumeSchema: z.object({ approved: z.boolean(), managerId: z.string() }),
  execute: async ({ data, suspend, resumeData }) => {
    if (resumeData) return { ...data, ...resumeData };
    if (data.amount > 500) await suspend("Manager approval required");
    return { ...data, approved: true };
  },
})
```
[^1]

### Workflow Streaming

Workflow execution supports real-time streaming via SSE, emitting step progress, agent text deltas, and completion events[^22].

---

## Server Architecture

### Two-Layer Design

The server system follows a **framework-agnostic** architecture[^9]:

1. **`@voltagent/server-core`** – Route definitions, request handlers, base provider, WebSocket support, auth interface
2. **`@voltagent/server-hono`** – Official [Hono](https://hono.dev/) implementation with OpenAPI/Swagger support

```
packages/server-core/src/
├── auth/              # Pluggable authentication
├── handlers/          # Business logic for endpoints
├── routes/            # Standardized route definitions
├── schemas/           # API schemas
├── server/            # BaseServerProvider abstract class
├── websocket/         # WebSocket infrastructure
├── mcp/               # MCP server integration
└── a2a/               # A2A protocol support

packages/server-hono/src/
├── app-factory.ts     # Hono app creation with OpenAPI
├── hono-server-provider.ts  # HonoServerProvider extends BaseServerProvider
├── routes/            # Hono route registration
├── auth/              # Hono auth middleware
├── mcp/               # Hono MCP routes
└── vendor/            # Vendored dependencies
```
[^25][^26]

### Server Provider Interface

```typescript
interface IServerProvider {
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
  isRunning(): boolean;
}
```
[^10]

### Configuration

```typescript
new VoltAgent({
  agents: { myAgent },
  server: honoServer({
    port: 3141,                          // Default port
    hostname: "::",                       // Dual-stack IPv4/IPv6
    enableSwaggerUI: true,                // OpenAPI docs
    configureApp: (app) => {              // Custom Hono middleware
      app.use("*", cors({ origin: "https://example.com" }));
      app.get("/health", (c) => c.json({ status: "ok" }));
    },
    auth: myAuthProvider,                  // Pluggable auth
  }),
});
```
[^9]

### WebSocket Endpoints

- `/ws` – Connection test/echo
- `/ws/logs` – Real-time logs (filterable)
- `/ws/observability` – Spans and logs for observability
[^9]

### Serverless Support

Via `@voltagent/serverless-hono` for Cloudflare Workers, Vercel Edge, and Deno:

```typescript
new VoltAgent({
  agents: { myAgent },
  serverless: serverlessHono({ corsOrigin: '*' }),
});
```
[^10]

### Port Management

Intelligent fallback: Default 3141 → 4310 → 1337 → etc. Central manager prevents conflicts[^9].

---

## Model Provider System

VoltAgent is built directly on the **Vercel AI SDK v6**, which means it doesn't wrap providers – you use the AI SDK provider packages directly[^2]:

```typescript
import { openai } from "@ai-sdk/openai";       // OpenAI
import { anthropic } from "@ai-sdk/anthropic";  // Anthropic
import { google } from "@ai-sdk/google";        // Google
import { groq } from "@ai-sdk/groq";            // Groq

const agent = new Agent({
  model: openai("gpt-4o-mini"),  // Just pass any LanguageModel
});
```

### Supported Providers (via AI SDK)

The `@voltagent/core` `package.json` lists 20+ provider dependencies[^4]:

| Provider | Package |
|----------|---------|
| OpenAI | `@ai-sdk/openai` |
| Anthropic | `@ai-sdk/anthropic` |
| Google | `@ai-sdk/google` |
| Google Vertex | `@ai-sdk/google-vertex` |
| AWS Bedrock | `@ai-sdk/amazon-bedrock` |
| Azure | `@ai-sdk/azure` |
| Groq | `@ai-sdk/groq` |
| Mistral | `@ai-sdk/mistral` |
| xAI (Grok) | `@ai-sdk/xai` |
| Perplexity | `@ai-sdk/perplexity` |
| Cohere | `@ai-sdk/cohere` |
| Together AI | `@ai-sdk/togetherai` |
| Deep Infra | `@ai-sdk/deepinfra` |
| Cerebras | `@ai-sdk/cerebras` |
| Vercel | `@ai-sdk/vercel` |
| Ollama | `ollama-ai-provider-v2` |
| Cloudflare Workers AI | `workers-ai-provider` |
| GitLab AI | `@gitlab/gitlab-ai-provider` |
| OpenAI-compatible | `@ai-sdk/openai-compatible` |

### Model Provider Registry

A `ModelProviderRegistry` in `packages/core/src/registries/` provides auto-generated type-safe model IDs with generated types in `model-provider-types.generated.ts`[^7].

---

## MCP (Model Context Protocol) Integration

VoltAgent implements full MCP client capabilities[^27]:

### As MCP Client

Agents can consume tools from external MCP servers:

```typescript
import { MCPConfiguration } from "@voltagent/core";

const mcpConfig = new MCPConfiguration({
  servers: {
    github: { type: "http", url: "https://api.githubcopilot.com/mcp" },
    filesystem: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "~/Desktop"] },
  },
});

const tools = await mcpConfig.getTools();
// Use tools with any agent
```

Supports four transport types: `http` (auto-fallback), `streamable-http`, `sse`, `stdio`[^27].

### As MCP Server

Via `@voltagent/mcp-server`, agents can be exposed as MCP servers for consumption by other AI systems[^28].

### Elicitation Support

MCP servers can request user input during tool execution. VoltAgent provides both client-level and agent-level elicitation handlers[^27].

---

## Guardrails

Guardrails intercept agent input/output at runtime[^29]:

### Types

- **Input Guardrails** (`createInputGuardrail()`) – Run before user input reaches the model
- **Output Guardrails** (`createOutputGuardrail()`) – Run after the model generates output

### Actions

Each guardrail can: `allow`, `modify` (change content), or `block` the operation.

### Built-in Guardrails

```typescript
import {
  createPIIInputGuardrail,
  createPromptInjectionGuardrail,
  createProfanityGuardrail,
  createMaxLengthGuardrail,
  createEmailRedactorGuardrail,
  createDefaultSafetyGuardrails,  // Bundle of common guardrails
} from "@voltagent/core";
```
[^7]

---

## RAG (Retrieval-Augmented Generation)

### Two Modes

1. **Always-on**: Set `retriever` on Agent – searches before every response
2. **On-demand**: Add retriever as a tool – agent decides when to search

### Retriever Interface

All retrievers extend `BaseRetriever` from `packages/core/src/retriever/`[^30]:

```typescript
class MyRetriever extends BaseRetriever {
  async retrieve(input, options) {
    const query = typeof input === "string" ? input : input[input.length - 1].content;
    const results = await this.searchMyData(query);
    return results.map(r => r.content).join("\n\n");
  }
}
```

### Supported Vector DBs

| Integration | Package |
|------------|---------|
| VoltAgent KB | Built-in (`VoltAgentRagRetriever`) |
| Chroma | `@voltagent/rag` |
| Pinecone | `@voltagent/rag` |
| Qdrant | `@voltagent/rag` |
[^30]

### Chunkers

The `@voltagent/rag` package provides 15+ chunking strategies: code, HTML, JSON, LaTeX, markdown, neural, recursive, semantic, sentence, token, table, and more[^31].

---

## Voice System

The `@voltagent/voice` package provides TTS and STT capabilities[^32]:

### Providers

| Provider | TTS | STT |
|----------|-----|-----|
| OpenAI | ✅ | ✅ |
| ElevenLabs | ✅ | ❌ |
| xsAI | ✅ | ✅ |
| Custom | ✅ | ✅ |

### Usage

```typescript
import { OpenAIVoiceProvider } from "@voltagent/voice";

const voice = new OpenAIVoiceProvider({
  apiKey: process.env.OPENAI_API_KEY,
  ttsModel: "tts-1",
  voice: "alloy",
});

const audioStream = await voice.speak("Hello from VoltAgent!");
const text = await voice.listen(audioFileStream);
```
[^32]

---

## Observability

### OpenTelemetry Integration

VoltAgent uses OpenTelemetry for tracing and logging (`packages/core/src/observability/`)[^7]:

- `VoltAgentObservability` – Main observability orchestrator
- `WebSocketSpanProcessor` – Streams spans to WebSocket clients
- `LocalStorageSpanProcessor` – Persists spans locally
- `WebSocketLogProcessor` – Streams logs in real-time

### Telemetry exports

```typescript
export { VoltAgentObservability } from "./observability";
export { WebSocketSpanProcessor, WebSocketEventEmitter } from "./observability";
export { LocalStorageSpanProcessor } from "./observability";
export { WebSocketLogProcessor } from "./observability";
```
[^7]

### VoltOps Console Integration

The `VoltOpsClient` in `packages/core/src/voltops/` provides:
- Telemetry export to the VoltOps platform
- Prompt management (fetch, cache, version prompts)
- Memory management APIs
[^10]

---

## A2A (Agent-to-Agent) Protocol

The `@voltagent/a2a-server` package enables agents to communicate via the Agent-to-Agent protocol, allowing VoltAgent agents to be discovered and called by other agent systems[^33].

---

## Evaluation System

### Architecture

- **`packages/core/src/eval/`** – Evaluation runtime within core
- **`packages/evals/`** – Eval definitions and test suites
- **`packages/scorers/`** – Scoring metrics (accuracy, latency, etc.)

Agents can be configured with eval scoring:

```typescript
const agent = new Agent({
  eval: {
    scorers: [accuracyScorer, latencyScorer],
    sampling: { rate: 0.1 }, // 10% sampling
  },
});
```
[^7]

---

## Key Packages Summary

| Package | npm | Purpose |
|---------|-----|---------|
| [`@voltagent/core`](https://github.com/VoltAgent/voltagent/tree/main/packages/core) | `@voltagent/core` | Agent, tools, memory, workflow, observability, guardrails |
| [`@voltagent/server-core`](https://github.com/VoltAgent/voltagent/tree/main/packages/server-core) | `@voltagent/server-core` | Framework-agnostic server layer |
| [`@voltagent/server-hono`](https://github.com/VoltAgent/voltagent/tree/main/packages/server-hono) | `@voltagent/server-hono` | Hono-based HTTP server with Swagger |
| [`@voltagent/serverless-hono`](https://github.com/VoltAgent/voltagent/tree/main/packages/serverless-hono) | `@voltagent/serverless-hono` | Serverless: CF Workers, Vercel Edge, Deno |
| [`@voltagent/libsql`](https://github.com/VoltAgent/voltagent/tree/main/packages/libsql) | `@voltagent/libsql` | LibSQL/SQLite memory adapter |
| [`@voltagent/postgres`](https://github.com/VoltAgent/voltagent/tree/main/packages/postgres) | `@voltagent/postgres` | PostgreSQL memory adapter |
| [`@voltagent/supabase`](https://github.com/VoltAgent/voltagent/tree/main/packages/supabase) | `@voltagent/supabase` | Supabase memory adapter |
| [`@voltagent/cloudflare-d1`](https://github.com/VoltAgent/voltagent/tree/main/packages/cloudflare-d1) | `@voltagent/cloudflare-d1` | Cloudflare D1 memory adapter |
| [`@voltagent/voltagent-memory`](https://github.com/VoltAgent/voltagent/tree/main/packages/voltagent-memory) | `@voltagent/voltagent-memory` | Managed memory (VoltOps-hosted) |
| [`@voltagent/rag`](https://github.com/VoltAgent/voltagent/tree/main/packages/rag) | `@voltagent/rag` | RAG: chunkers, vector DB integrations |
| [`@voltagent/voice`](https://github.com/VoltAgent/voltagent/tree/main/packages/voice) | `@voltagent/voice` | TTS/STT: OpenAI, ElevenLabs, xsAI |
| [`@voltagent/mcp-server`](https://github.com/VoltAgent/voltagent/tree/main/packages/mcp-server) | `@voltagent/mcp-server` | Expose agents as MCP servers |
| [`@voltagent/a2a-server`](https://github.com/VoltAgent/voltagent/tree/main/packages/a2a-server) | `@voltagent/a2a-server` | A2A protocol server |
| [`@voltagent/evals`](https://github.com/VoltAgent/voltagent/tree/main/packages/evals) | `@voltagent/evals` | Evaluation framework |
| [`@voltagent/scorers`](https://github.com/VoltAgent/voltagent/tree/main/packages/scorers) | `@voltagent/scorers` | Scoring metrics |
| [`@voltagent/sdk`](https://github.com/VoltAgent/voltagent/tree/main/packages/sdk) | `@voltagent/sdk` | Client SDK for API consumption |
| [`@voltagent/logger`](https://github.com/VoltAgent/voltagent/tree/main/packages/logger) | `@voltagent/logger` | Pino-based logger |
| [`@voltagent/cli`](https://github.com/VoltAgent/voltagent/tree/main/packages/cli) | `@voltagent/cli` | CLI tools |
| [`@voltagent/resumable-streams`](https://github.com/VoltAgent/voltagent/tree/main/packages/resumable-streams) | `@voltagent/resumable-streams` | Resumable streaming support |
| [`@voltagent/langfuse-exporter`](https://github.com/VoltAgent/voltagent/tree/main/packages/langfuse-exporter) | `@voltagent/langfuse-exporter` | Langfuse observability export |
| [`@voltagent/vercel-ai-exporter`](https://github.com/VoltAgent/voltagent/tree/main/packages/vercel-ai-exporter) | `@voltagent/vercel-ai-exporter` | Vercel AI telemetry export |
| [`@voltagent/sandbox-e2b`](https://github.com/VoltAgent/voltagent/tree/main/packages/sandbox-e2b) | `@voltagent/sandbox-e2b` | E2B sandboxed execution |
| [`@voltagent/sandbox-daytona`](https://github.com/VoltAgent/voltagent/tree/main/packages/sandbox-daytona) | `@voltagent/sandbox-daytona` | Daytona sandboxed execution |
| [`@voltagent/ag-ui`](https://github.com/VoltAgent/voltagent/tree/main/packages/ag-ui) | `@voltagent/ag-ui` | Agent UI protocol support |
| [`@voltagent/docs-mcp`](https://github.com/VoltAgent/voltagent/tree/main/packages/docs-mcp) | `@voltagent/mcp-docs-server` | MCP docs server for AI assistants |
| `create-voltagent-app` | `create-voltagent-app` | Project scaffolding CLI |

---

## Competitive Comparison

Based on VoltAgent's own feature comparison table[^34]:

| Feature | VoltAgent | Mastra | AI SDK | AI SDK Tools |
|---------|-----------|--------|--------|-------------|
| Agents | ✅ | ✅ | Partial | ✅ |
| Workflows | ✅ | ✅ | ❌ | ❌ |
| Actions & Triggers | ✅ | ❌ | ❌ | ❌ |
| Tool Calling | ✅ | ✅ | ✅ | ✅ |
| Working Memory | ✅ | ✅ | ❌ | ✅ |
| Semantic Memory | ✅ | ✅ | ❌ | ❌ |
| RAG | ✅ | Partial | Partial | Partial |
| Prompt Management | ✅ | ❌ | ❌ | ❌ |
| API Layer | ✅ (Pluggable Hono) | Partial (Hono only) | ❌ | ❌ |
| Guardrails | ✅ | ✅ | ❌ | Partial |
| MCP Server | ✅ | ✅ | ❌ | ❌ |
| A2A Communication | ✅ | ✅ | ❌ | ❌ |
| Evals (Dataset & Experiments) | ✅ (Full UI, cron) | ❌ | ❌ | ❌ |
| Alerts | ✅ (Latency, errors) | ❌ | ❌ | ❌ |
| Local Tunnel | ✅ | ❌ | ❌ | ❌ |
| Edge Compatible | ✅ | ✅ | ✅ | ✅ |

---

## Migration: 1.x → 2.x

VoltAgent 2.x aligns with AI SDK v6. Key changes[^35]:

- No breaking changes in VoltAgent APIs
- AI SDK v6 renamed `LanguageModelV1` → `LanguageModel` 
- Provider packages bumped to v3+
- `ai.generateText` → AI SDK v6 equivalents
- `peerDependencies` now require `ai@^6.0.0` and `zod@^3.25.0 || ^4.0.0`

---

## UI Integration

VoltAgent provides integration guides for frontend frameworks[^36]:

- **AI SDK UI** – Direct `useChat`/`useCompletion` hooks
- **Assistant UI** – assistant-ui library integration
- **CopilotKit** – CopilotKit integration

---

## Examples

The repository includes **73 examples**[^6] covering:

- Basic agent setup
- Multi-agent research assistants
- WhatsApp chatbots
- YouTube-to-blog conversion
- Recipe generators
- Slack agents
- Airtable integrations
- RAG with Chroma, Pinecone, Qdrant
- Voice agents
- MCP tool usage
- Workflow patterns (suspend/resume, human-in-the-loop)

---

## Development & Contributing

### Build System

- **Package Manager**: pnpm 8.10.5+
- **Build**: tsup (per package), Lerna for orchestration, Nx for caching
- **Testing**: Vitest with TypeScript type checking
- **Linting**: Biome
- **Formatting**: Prettier (for markdown/mdx)
- **CI**: Changesets for versioning
- **Node**: ≥20 required[^5]

### Key Commands

```bash
pnpm install          # Install dependencies
pnpm build:all        # Build all packages
pnpm test:all         # Run all tests
pnpm lint             # Run Biome linter
pnpm coffee           # Nuke + install + build (clean start)
```
[^5]

---

## Confidence Assessment

**High Confidence:**
- Architecture, package structure, and API surface – verified through source code inspection
- Feature set and capabilities – verified through documentation and source code
- Provider compatibility – verified through `package.json` dependencies
- Workflow engine capabilities – verified through source code structure and documentation
- Server architecture – verified through documentation and source file layout

**Medium Confidence:**
- VoltOps Console capabilities – described in README and docs but the console is a closed-source cloud/self-hosted product; specific implementation details not available in the open-source repo
- Evaluation system specifics – the `packages/evals/` and `packages/scorers/` packages exist but detailed source wasn't deeply inspected
- Performance characteristics – no benchmarks were found in the repository

**Low Confidence / Not Verified:**
- Production deployment best practices beyond what's documented
- VoltOps pricing and enterprise features
- Community adoption metrics beyond npm download badges

---

## Footnotes

[^1]: [VoltAgent/voltagent README.md](https://github.com/VoltAgent/voltagent) – Main repository README
[^2]: VoltAgent docs `getting-started/providers-models.md` – "VoltAgent is built directly on top of the Vercel AI SDK"
[^3]: [VoltAgent/voltagent README.md](https://github.com/VoltAgent/voltagent) – VoltOps Console section
[^4]: `packages/core/package.json` – version "2.6.9", dependency list
[^5]: Root `package.json` – monorepo config, scripts, engines, devDependencies
[^6]: VoltAgent examples listing – 73 total examples
[^7]: `packages/core/src/index.ts` – Public API exports showing all subsystems
[^8]: `packages/core/src/voltagent.ts` – VoltAgent bootstrap class (26KB)
[^9]: VoltAgent docs `api/server-architecture.md` – Server architecture documentation
[^10]: `packages/core/src/types.ts` – VoltAgentOptions, ServerProviderDeps, IServerProvider interfaces
[^11]: VoltAgent docs `agents/overview.md` – Agent overview documentation
[^12]: VoltAgent docs `agents/subagents.md` – Sub-agents documentation
[^13]: `packages/core/src/planagent/` directory – PlanAgent implementation
[^14]: VoltAgent docs `agents/tools.md` – Tools documentation
[^15]: `packages/core/src/tool/` directory – Tool subsystem source
[^16]: VoltAgent docs `agents/cancellation.md` – Cancellation support
[^17]: VoltAgent docs `agents/memory/overview.md` – Memory system documentation
[^18]: VoltAgent docs `workflows/overview.md` – Workflow engine documentation
[^19]: `packages/core/src/workflow/core.ts` – 141KB core workflow engine
[^20]: `packages/core/src/workflow/chain.ts` – 35KB WorkflowChain builder
[^21]: `packages/core/src/workflow/types.ts` – 31KB workflow types
[^22]: `packages/core/src/workflow/stream.ts` – 13KB workflow streaming
[^23]: `packages/core/src/workflow/registry.ts` – 14KB workflow registry
[^24]: `packages/core/src/workflow/suspend-controller.ts` – Suspend/resume controller
[^25]: `packages/server-core/src/` – Server core directory listing
[^26]: `packages/server-hono/src/` – Hono server directory listing
[^27]: VoltAgent docs `agents/mcp/mcp.md` – MCP client documentation
[^28]: VoltAgent docs `agents/mcp/mcp-server.md` – MCP server documentation
[^29]: VoltAgent docs `guardrails/overview.md` – Guardrails documentation
[^30]: VoltAgent docs `rag/overview.md` – RAG overview documentation
[^31]: VoltAgent docs `rag/chunkers/overview.md` – 15+ chunking strategies
[^32]: VoltAgent docs `agents/voice.md` – Voice capabilities documentation
[^33]: `packages/a2a-server/` – A2A server package
[^34]: VoltAgent docs `getting-started/comparison.mdx` – Feature comparison table
[^35]: VoltAgent docs `getting-started/migration-guide.md` – 1.x → 2.x migration
[^36]: VoltAgent docs `ui/overview.md` – UI integration docs
