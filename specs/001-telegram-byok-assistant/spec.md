# Feature Specification: Telegram BYOK Personal Assistant with Skill Discovery

**Feature Branch**: `001-telegram-byok-assistant`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: User description: "Build a personal assistant using VoltAgent that communicates over Telegram, supports BYOK multi-LLM providers including Azure AI Foundry, and can discover and install skills via find-skills"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Chat with the Assistant via Telegram (Priority: P1)

A user opens the Telegram app, finds the bot by its handle, and sends a text message (e.g., "What's the weather like in Colombo?"). The assistant reads the message, processes it through the VoltAgent agent, and replies within the same Telegram chat. The conversation is persistent — the user can send follow-up messages and the assistant remembers prior context within the same conversation thread.

**Why this priority**: Without Telegram as the communication channel, the entire feature has no user-facing interface. This is the foundational slice that proves end-to-end connectivity: Telegram → Agent → LLM → Telegram.

**Independent Test**: Can be fully tested by sending messages to the Telegram bot and verifying replies appear in the chat. Delivers a working conversational assistant accessible from any Telegram client (mobile, desktop, web).

**Acceptance Scenarios**:

1. **Given** the bot is running and a Telegram bot token is configured, **When** a user sends "Hello" to the bot, **Then** the bot replies with a relevant greeting within the same chat.
2. **Given** the user has sent two previous messages in the conversation, **When** the user sends a follow-up that references prior context (e.g., "Tell me more about that"), **Then** the assistant responds with context-aware content drawing from the conversation history.
3. **Given** the bot is running, **When** a user sends a very long message (>4000 characters), **Then** the assistant processes it and replies (splitting the response into multiple Telegram messages if the reply exceeds Telegram's message length limit of 4096 characters).
4. **Given** the bot is running, **When** the LLM provider returns an error (e.g., rate limit, invalid key), **Then** the bot replies with a user-friendly error message (not a stack trace) informing the user to try again later.

---

### User Story 2 - Switch LLM Provider via Environment Configuration (Priority: P2)

The owner of the assistant (the developer/operator) wants to switch the backing LLM from OpenAI GPT-4o-mini to Anthropic Claude, Google Gemini, or any other supported provider. They update environment variables (`MODEL_PROVIDER` and `MODEL_ID`) and restart the service. The assistant now uses the new provider without any code changes. API keys for each provider are supplied via their own environment variables (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AZURE_API_KEY`).

**Why this priority**: BYOK is a core differentiator — users must not be locked into a single LLM vendor. This story is independently valuable because it allows cost optimization, vendor risk mitigation, and experimentation with different models.

**Independent Test**: Can be tested by setting `MODEL_PROVIDER=anthropic` and `MODEL_ID=claude-sonnet-4-20250514`, providing `ANTHROPIC_API_KEY`, restarting the service, and confirming the Telegram bot responds using Claude. Repeat for at least two other providers.

**Acceptance Scenarios**:

1. **Given** `MODEL_PROVIDER=openai` and `MODEL_ID=gpt-4o-mini` in the environment, **When** the service starts, **Then** the agent uses OpenAI's GPT-4o-mini for all responses.
2. **Given** `MODEL_PROVIDER=anthropic` and `MODEL_ID=claude-sonnet-4-20250514`, **When** the service starts, **Then** the agent uses Anthropic Claude for all responses.
3. **Given** `MODEL_PROVIDER=azure` and `MODEL_ID=gpt-4o`, along with `AZURE_RESOURCE_NAME` and `AZURE_API_KEY`, **When** the service starts, **Then** the agent uses Azure AI Foundry's hosted model.
4. **Given** no `MODEL_PROVIDER` is set, **When** the service starts, **Then** it falls back to `openai/gpt-4o-mini` as the default.
5. **Given** an unsupported `MODEL_PROVIDER` value (e.g., `foobar`), **When** the service starts, **Then** it logs a clear error message listing supported providers and exits gracefully.

---

### User Story 3 - Use Azure AI Foundry Models (Priority: P3)

The operator deploys models through Azure AI Foundry (Azure OpenAI Service) and wants the assistant to use those models. They configure the Azure-specific environment variables (resource name, API key, deployment name / model ID) and the assistant connects to the Azure-hosted model endpoint. This works identically to any other provider — the Telegram user experience is unchanged.

**Why this priority**: Azure AI Foundry is explicitly requested as a first-class provider. It has unique configuration requirements (resource name, deployment name) that go beyond the generic BYOK story, warranting its own acceptance criteria.

**Independent Test**: Can be tested by provisioning an Azure OpenAI resource, deploying a model (e.g., GPT-4o), setting the Azure environment variables, and verifying the Telegram bot responds using the Azure-hosted model.

**Acceptance Scenarios**:

1. **Given** `MODEL_PROVIDER=azure`, `AZURE_RESOURCE_NAME=my-resource`, `AZURE_API_KEY=<key>`, and `MODEL_ID=gpt-4o`, **When** a user sends a message via Telegram, **Then** the assistant responds using the Azure-hosted GPT-4o deployment.
2. **Given** Azure credentials are configured but the resource name is incorrect, **When** the service starts and a user sends a message, **Then** the bot replies with a user-friendly error indicating a configuration problem (not an unhandled exception).

---

### User Story 4 - Discover and Install Skills (Priority: P4)

The user (or operator) wants the assistant to gain new capabilities on demand. Via Telegram, the user asks something like "find a skill for code review" or "how do I summarize PDFs?". The assistant searches the skills.sh API, presents top results with security audit scores, and — upon user confirmation — installs the selected skill. The newly installed skill enriches the agent's capabilities for future interactions.

**Why this priority**: Skill discovery makes the assistant self-extending, but it depends on the core Telegram + LLM pipeline (P1 + P2) being functional first. It is independently testable once the base assistant works.

**Independent Test**: Can be tested by sending "find a skill for web scraping" to the Telegram bot, verifying a formatted results list is returned with security scores, selecting one, and confirming the installation succeeds.

**Acceptance Scenarios**:

1. **Given** the assistant is running, **When** the user sends "find a skill for react best practices", **Then** the bot searches skills.sh and replies with a numbered list of matching skills including name, publisher, install count, and security audit scores (Gen Agent Trust Hub, Socket, Snyk).
2. **Given** search results have been presented, **When** the user replies "1" (picking the first skill), **Then** the assistant fetches the skill's SKILL.md, reviews it for security concerns, and — if the skill has no critical security flags — installs it.
3. **Given** a skill has a red security flag (e.g., Snyk: High Risk), **When** the user picks that skill, **Then** the assistant warns the user about the specific security concern and asks for explicit confirmation before proceeding.
4. **Given** no skills match the search query, **When** the user asks "find a skill for quantum teleportation", **Then** the bot replies that no matching skills were found and offers to help directly with general capabilities.

---

### Edge Cases

- What happens when the Telegram bot token is missing or invalid? The service logs an error with clear instructions and exits; it does not start in a broken state.
- What happens when the user sends media (photo, voice, document) instead of text? The assistant replies that it currently supports text messages only.
- What happens when the operator provides API keys for multiple providers simultaneously? Only the provider specified by `MODEL_PROVIDER` is used; other keys are ignored (no ambiguity).
- What happens when the skills.sh API is unreachable? The bot informs the user that skill search is temporarily unavailable and suggests trying again later.
- What happens when a Telegram user the operator hasn't authorized attempts to use the bot? The bot is open by default; optional user-allowlisting can be configured via an `ALLOWED_TELEGRAM_USER_IDS` environment variable (comma-separated). If set and the user is not in the list, the bot replies with a polite access-denied message.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST accept text messages from Telegram users via the Telegram Bot API and forward them to the VoltAgent agent for processing.
- **FR-002**: The system MUST send the agent's response back to the originating Telegram chat as a text reply.
- **FR-003**: The system MUST maintain per-user conversation history using VoltAgent's Memory system, scoped by Telegram user ID as the `userId` and Telegram chat ID as the `conversationId`.
- **FR-004**: The system MUST support Telegram long-polling mode for local development and webhook mode for production deployment, selectable via the `TELEGRAM_MODE` environment variable (`polling` or `webhook`).
- **FR-005**: The system MUST resolve the LLM provider and model at startup from `MODEL_PROVIDER` and `MODEL_ID` environment variables, with no code changes required to switch between supported providers.
- **FR-006**: The system MUST support at minimum the following providers: OpenAI, Anthropic, Google Gemini, Azure AI Foundry, Groq, Mistral, and Ollama.
- **FR-007**: The system MUST fall back to `openai/gpt-4o-mini` when `MODEL_PROVIDER` and `MODEL_ID` are not set.
- **FR-008**: The system MUST validate the configured provider at startup and exit with a descriptive error if the provider is unsupported or required environment variables (e.g., API keys) are missing.
- **FR-009**: The system MUST support Azure AI Foundry models by accepting `AZURE_RESOURCE_NAME`, `AZURE_API_KEY`, and `MODEL_ID` (deployment name) environment variables, and connecting via the `@ai-sdk/azure` provider package.
- **FR-010**: The system MUST expose a `findSkills` tool (via `createTool`) that searches the skills.sh API, fetches audit data, and returns a formatted list of matching skills with security scores.
- **FR-011**: The system MUST expose an `installSkill` tool (via `createTool`) that, given a skill selection, fetches the SKILL.md, validates the content, and installs the skill locally. Security audit scores are surfaced by the `findSkills` tool; the agent MUST warn the user about non-green flags in conversation before invoking `installSkill`.
- **FR-012**: The Telegram channel adapter MUST reside in `src/channels/telegram.ts` and MUST NOT contain agent logic, LLM configuration, or tool definitions — it only translates between the Telegram Bot API protocol and VoltAgent agent invocations.
- **FR-013**: The system MUST reply with a user-friendly error message when the LLM provider returns an error (rate limit, auth failure, timeout), rather than exposing technical details.
- **FR-014**: The system MUST reply with a "text messages only" notice when a user sends unsupported media types (photos, voice notes, documents, stickers).
- **FR-015**: The system MUST optionally restrict access to specified Telegram user IDs via the `ALLOWED_TELEGRAM_USER_IDS` environment variable (comma-separated). When set, unauthorized users receive a polite access-denied reply.
- **FR-016**: The system MUST split agent responses exceeding Telegram's 4096-character message limit into multiple sequential messages.

### Key Entities

- **Conversation**: A persistent dialogue thread between a Telegram user and the agent, identified by Telegram chat ID. Stores message history for context continuity.
- **Provider Configuration**: The runtime-resolved LLM backend, consisting of a provider identifier, model ID, and associated credentials. Exactly one provider is active at a time.
- **Skill**: A discoverable, installable capability sourced from the skills.sh ecosystem. Includes metadata (name, publisher, install count) and security audit scores.
- **Channel Adapter**: A module that translates between an external messaging protocol (Telegram Bot API) and VoltAgent agent method calls. Decoupled from agent and tool logic.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can send a text message via Telegram and receive a contextually relevant reply within 10 seconds (excluding LLM processing time variability).
- **SC-002**: The operator can switch between at least 3 different LLM providers (e.g., OpenAI, Anthropic, Azure) by changing only environment variables — zero source code edits required.
- **SC-003**: Azure AI Foundry-hosted models are usable with the same user experience as any other provider — no special Telegram-side configuration or user-visible differences.
- **SC-004**: A user can discover skills by asking the assistant in natural language (e.g., "find a skill for X") and receive a formatted list with security audit information within 15 seconds.
- **SC-005**: Installed skills are persisted to disk (`./skills/`) across assistant restarts. Note: loading installed skill content into the agent's runtime context at startup is deferred to a future iteration; this feature ensures skills survive restarts on the filesystem.
- **SC-006**: Multi-turn conversations maintain context for at least 20 exchanges within the same chat, with the assistant accurately referencing earlier messages.
- **SC-007**: The assistant gracefully handles all error conditions (invalid API key, provider down, Telegram API failures) without crashing — structured error messages are logged and user-friendly messages are sent to the chat.
- **SC-008**: Adding a new communication channel (e.g., Slack, WhatsApp) requires creating only a new file under `src/channels/` with no changes to agent, tool, or workflow code.

## Assumptions

- The operator has a Telegram bot token obtained from BotFather.
- The operator has at least one valid LLM provider API key.
- For Azure AI Foundry, the operator has already deployed a model in their Azure OpenAI resource.
- The skills.sh API at `https://skills.sh/api/search` and audit page at `https://skills.sh/audits` are publicly accessible.
- The VoltAgent Hono server continues to run alongside the Telegram bot (for VoltOps console observability and the existing HTTP API).
- The `grammy` package is used for Telegram Bot API integration, providing both long-polling and webhook support.
