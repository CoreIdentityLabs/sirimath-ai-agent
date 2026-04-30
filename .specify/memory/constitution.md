<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR — two new principles added (VI, VII);
  technology stack materially expanded for multi-provider BYOK
  and Telegram channel support.

Modified principles:
  - (none renamed or redefined)

Added sections:
  - Principle VI. Multi-Provider / BYOK
  - Principle VII. Channel Abstraction

Removed sections: none

Templates reviewed:
  ✅ .specify/templates/plan-template.md  — Constitution Check table
     updated with Principle VI and VII rows
  ✅ .specify/templates/spec-template.md  — no constitution-specific
     placeholders; aligned
  ✅ .specify/templates/tasks-template.md — no constitution-specific
     placeholders; aligned
  ✅ .specify/templates/checklist-template.md — no constitution-specific
     placeholders; aligned

Deferred TODOs: none
-->

# sirimath-ai-agent Constitution

## Core Principles

### I. Agent-First Design

Every feature MUST be designed around the VoltAgent agent paradigm.
Agents are the primary runtime interface; raw HTTP endpoints MUST NOT be
exposed without a backing agent. Each agent MUST have a single, clearly
stated purpose declared in its `instructions` field.

**Rationale**: The project's value derives from agent behaviour and
composability. Bypassing the agent layer fragments observability and
undermines the framework contract.

### II. Type Safety (NON-NEGOTIABLE)

All source code MUST be written in TypeScript with `strict` mode enabled.
Use of `any` is forbidden unless wrapped in an explicit, commented override.
All tool inputs and outputs MUST be defined with Zod schemas. Workflow step
schemas (`input`, `result`, `resumeSchema`) MUST be Zod objects — never
inferred from plain values.

**Rationale**: Strict typing eliminates entire classes of runtime errors in
agent pipelines and enables reliable IDE tooling and refactoring.

### III. Tool-Driven Extensibility

New agent capabilities MUST be introduced as typed tools created with
`createTool`. Each tool MUST declare: a unique `name`, a human-readable
`description`, an input Zod schema, an output Zod schema, and an
`execute` function. Tools MUST be independently testable in isolation from
the agent.

**Rationale**: Encapsulated tools keep the agent surface minimal, make
capabilities composable across agents, and allow capability changes without
touching agent configuration.

### IV. Observability-First

All agent and workflow operations MUST emit traces. The LibSQL observability
adapter (`VoltAgentObservability` + `LibSQLObservabilityAdapter`) MUST remain
configured in every deployment. The VoltOps Platform integration
(`VoltOpsClient`) MUST be provided with valid credentials in production; a
no-op (empty string keys) is acceptable only in local development.
Structured logging via `createPinoLogger` MUST be used — `console.log` in
production code is forbidden.

**Rationale**: Agent behaviour is non-deterministic. Without traces, debugging
regressions is impractical. Observability is not optional.

### V. Simplicity & YAGNI

Features MUST NOT be added in anticipation of hypothetical future needs.
Every new abstraction (helper, service, adapter) MUST be justified by an
existing requirement. Prefer inline handler logic over elaborate class
hierarchies unless the handler exceeds ~50 lines or is reused in two or more
independent tools/workflows.

**Rationale**: AI agent codebases accumulate complexity quickly. Radical
simplicity keeps onboarding fast and the agent surface comprehensible.

### VI. Multi-Provider / BYOK

The agent MUST support multiple LLM providers via the Vercel AI SDK
provider ecosystem (Bring Your Own Key). Model selection MUST be
configurable through environment variables (`MODEL_PROVIDER` and
`MODEL_ID`); no source code changes are permitted to switch providers.
Azure AI Foundry models MUST be supported as a first-class provider
alongside OpenAI, Anthropic, Google, and others. Each provider
package (e.g., `@ai-sdk/azure`, `@ai-sdk/openai`) is an optional
runtime dependency — only the configured provider is loaded.

**Rationale**: A personal assistant locked to a single vendor
limits user choice and increases cost risk. BYOK ensures users
control their own API keys, billing, and model selection while the
agent code remains provider-agnostic.

### VII. Channel Abstraction

Communication channels (Telegram, HTTP API, future channels) MUST be
decoupled from agent logic. Each channel adapter MUST translate
external protocol messages into VoltAgent agent invocations
(`generateText` / `streamText`). Channel-specific code MUST reside
in a dedicated module under `src/channels/`. The agent MUST remain
channel-agnostic — adding or removing a channel MUST NOT require
changes to agent instructions, tools, or workflows.

**Rationale**: The assistant's intelligence lives in the agent and
its tools. Coupling agent logic to a specific messaging protocol
(e.g., Telegram Bot API) prevents reuse across interfaces and
makes testing harder. Clean channel separation enables adding
new frontends (WhatsApp, Slack, voice) without touching core logic.

## Technology Stack

- **Runtime**: Node.js ≥ 20 (LTS); ESM modules (`"type": "module"`)
- **Language**: TypeScript 5.x, `strict: true`
- **Agent Framework**: `@voltagent/core` ^2.0.0 — no custom agent
  runners
- **LLM Providers**: Vercel AI SDK v6 provider packages; model
  selected at runtime via `MODEL_PROVIDER` + `MODEL_ID` env vars;
  fallback default: `openai/gpt-4o-mini`. Supported providers
  include (non-exhaustive):
  - `@ai-sdk/openai` — OpenAI / OpenAI-compatible
  - `@ai-sdk/azure` — Azure AI Foundry (Azure OpenAI)
  - `@ai-sdk/anthropic` — Anthropic Claude
  - `@ai-sdk/google` — Google Gemini
  - `@ai-sdk/groq` — Groq
  - `@ai-sdk/mistral` — Mistral
  - `ollama-ai-provider-v2` — Ollama (local models)
- **Telegram**: `grammy` — Telegram Bot API framework; webhook or
  long-polling mode configurable via environment
- **Server**: `@voltagent/server-hono` — Hono adapter; no additional
  HTTP frameworks
- **Persistence**: `@voltagent/libsql` (LibSQL/SQLite) for memory
  and observability; graph-backed memory stores (e.g., Neo4j) are allowed
  when explicitly justified in plan.md
- **Validation**: `zod` ^3 — sole schema and validation library
- **Linting**: Biome (`@biomejs/biome`) — ESLint and Prettier MUST
  NOT be added
- **Build**: `tsdown` — no Webpack, Rollup, or esbuild
  configurations outside tsdown
- **Container**: Dockerfile MUST remain the single production
  packaging artefact; no docker-compose in production deployments

## Development Workflow

Pre-commit gate (MUST pass in order):

1. `npm run lint` — Biome check; zero warnings policy
2. `npm run typecheck` — TypeScript compiler, no emit
3. `npm run build` — production bundle via tsdown

Local development: `npm run dev` (tsx watch, hot reload).

Environment variables MUST be loaded via `dotenv/config`; `.env` MUST be
gitignored; `.env.example` MUST document every required variable.

All secrets (API keys, bot tokens) MUST be injected via environment
variables — never hard-coded or committed.

Pull requests MUST include a brief description of which principles were
verified during review.

## Governance

This constitution supersedes all other project practices. Amendments require:

1. A documented rationale explaining why the existing principle is insufficient.
2. Version bump according to semantic versioning (see below).
3. Consistency propagation: all `.specify/templates/*.md` files MUST be
   reviewed and updated before the amendment is merged.
4. Commit message format:
   `docs: amend constitution to vX.Y.Z (<summary of change>)`

**Versioning policy**:

- MAJOR: Removal or backward-incompatible redefinition of an existing principle.
- MINOR: Addition of a new principle or material expansion of an existing one.
- PATCH: Clarifications, wording improvements, typo fixes.

**Compliance review**: Every feature plan (`plan.md`) MUST include a
Constitution Check section listing which gates apply to that feature. Reviewers
MUST reject plans that leave the Constitution Check blank or unevaluated.

**Version**: 1.1.0 | **Ratified**: 2026-03-16 | **Last Amended**: 2026-03-16
