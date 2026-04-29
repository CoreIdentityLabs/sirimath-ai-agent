# Feature Specification: Add LM Studio Model Provider

**Feature Branch**: `004-lmstudio-provider`  
**Created**: 2026-04-29  
**Status**: Draft  
**Input**: User description: "we need to introduce new model provider lm studio for sirimath ai"

## Overview

Sirimath AI currently supports cloud-hosted model providers (OpenAI, Anthropic, Google, Azure, Groq, Mistral) and one local provider (Ollama). This feature adds **LM Studio** as a second local model provider option, enabling operators to run Sirimath AI entirely offline using locally downloaded models managed through the LM Studio desktop application.

LM Studio exposes an OpenAI-compatible HTTP API on the operator's machine, so no API key is needed and no data leaves the local environment.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run Sirimath AI with a Local LM Studio Model (Priority: P1)

An operator who has LM Studio installed and a model downloaded wants to point Sirimath AI at it instead of a cloud provider. They set two environment variables — the provider name and the model ID — start the LM Studio server, and launch Sirimath AI. Conversations flow through the locally running model with no internet dependency.

**Why this priority**: This is the core value of the feature. Everything else is an enhancement on top of this working scenario.

**Independent Test**: Set `MODEL_PROVIDER=lmstudio` and `MODEL_ID=llama-3.2-1b` with LM Studio server running; send a chat message to Sirimath AI and receive a coherent response — no cloud credentials needed.

**Acceptance Scenarios**:

1. **Given** LM Studio is installed with `llama-3.2-1b` downloaded and the local server running, **When** the operator sets `MODEL_PROVIDER=lmstudio` and `MODEL_ID=llama-3.2-1b` and starts Sirimath AI, **Then** Sirimath AI successfully processes chat messages using the local model.
2. **Given** Sirimath AI is running with LM Studio, **When** a user sends a message, **Then** the response streams back in real time, matching the streaming behaviour of all other providers.
3. **Given** LM Studio is configured as the provider, **When** no `OPENAI_API_KEY` or other cloud credential is present in the environment, **Then** Sirimath AI starts and operates normally without any authentication errors.

---

### User Story 2 - Configure a Custom LM Studio Server Address (Priority: P2)

An operator runs LM Studio on a non-default port (e.g., in a team environment or on a separate machine on the local network). They need to point Sirimath AI at the correct address without modifying code.

**Why this priority**: The default port is sufficient for most local setups, but network deployments are a realistic secondary use-case and the feature is trivially supported via an environment variable.

**Independent Test**: Set `LMSTUDIO_BASE_URL=http://192.168.1.50:5678/v1` with a running LM Studio server at that address; Sirimath AI connects and responds correctly.

**Acceptance Scenarios**:

1. **Given** LM Studio is running on a custom host/port, **When** the operator sets `LMSTUDIO_BASE_URL` to the correct address and starts Sirimath AI, **Then** Sirimath AI connects to that address instead of the default `http://localhost:1234/v1`.
2. **Given** `LMSTUDIO_BASE_URL` is not set, **When** `MODEL_PROVIDER=lmstudio` is used, **Then** Sirimath AI defaults to `http://localhost:1234/v1` without requiring any additional configuration.

---

### User Story 3 - Clear Error When LM Studio Server Is Not Running (Priority: P3)

An operator sets `MODEL_PROVIDER=lmstudio` but forgets to start the LM Studio server. Instead of hanging silently or producing a cryptic network error, Sirimath AI fails fast with an actionable message.

**Why this priority**: Good developer ergonomics; especially important for a local provider where "server not running" is a common mistake.

**Independent Test**: Set `MODEL_PROVIDER=lmstudio` with LM Studio server stopped; attempt to send a chat message and observe a clear error within a few seconds (not a long timeout).

**Acceptance Scenarios**:

1. **Given** `MODEL_PROVIDER=lmstudio` is set but the LM Studio server is not running, **When** a chat request is made, **Then** Sirimath AI returns an error within 5 seconds indicating the local server is unreachable.
2. **Given** the LM Studio server is unreachable mid-conversation, **When** a subsequent message is sent, **Then** the error is surfaced to the user rather than hanging indefinitely.

---

### Edge Cases

- What happens when the LM Studio server is running but the requested `MODEL_ID` is not loaded? The server returns an error; Sirimath AI should surface it to the operator rather than crashing silently.
- What happens when `LMSTUDIO_BASE_URL` is set to an invalid URL format? Sirimath AI should fail at startup with a descriptive configuration error.
- What happens when the model is mid-download in LM Studio and the server is started before the model is ready? The request will fail; the error should indicate the model is unavailable.
- What happens if both `LMSTUDIO_BASE_URL` and the default address are unreachable? The first connection attempt fails fast; no retry loop against a dead server.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept `lmstudio` as a valid value for the `MODEL_PROVIDER` environment variable, alongside all existing supported providers.
- **FR-002**: System MUST connect to the LM Studio local server at `http://localhost:1234/v1` by default when `MODEL_PROVIDER=lmstudio`.
- **FR-003**: System MUST allow the LM Studio server address to be overridden via a `LMSTUDIO_BASE_URL` environment variable so operators can target non-default ports or remote addresses.
- **FR-004**: System MUST use the value of `MODEL_ID` to select which locally loaded model to call, with no hard-coded model name.
- **FR-005**: System MUST NOT require any API key or authentication credential when using LM Studio as the provider.
- **FR-006**: System MUST stream responses from LM Studio in real time, consistent with the streaming behaviour of all other providers.
- **FR-007**: System MUST fail fast (within 5 seconds) with a human-readable error when the LM Studio server is unreachable, rather than hanging on retries.
- **FR-008**: System MUST surface a clear error message when the requested model is not loaded in LM Studio, distinguishing it from a network connectivity failure where possible.
- **FR-009**: System MUST document the required setup steps (install LM Studio, download a model, start the local server, set env vars) in the project README or equivalent operator guide.

### Key Entities

- **Provider Configuration**: The set of environment variables (`MODEL_PROVIDER`, `MODEL_ID`, `LMSTUDIO_BASE_URL`) that collectively describe how Sirimath AI connects to LM Studio. No sensitive values; all are operator-supplied at deploy/run time.
- **LM Studio Local Server**: The OpenAI-compatible HTTP server embedded in LM Studio, running on the operator's machine. It is external to Sirimath AI and must be started independently.
- **Locally Loaded Model**: A language model that the operator has downloaded and loaded inside LM Studio. Identified by its model ID string as shown in the LM Studio UI.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can switch from any existing provider to LM Studio by changing only environment variables — no code changes required — and receive a working response within their first attempt.
- **SC-002**: When LM Studio is the active provider and the server is not running, Sirimath AI surfaces an error within 5 seconds of the first failed request.
- **SC-003**: Streaming responses from LM Studio are indistinguishable in behaviour from streaming responses from cloud providers — tokens appear progressively as the model generates them.
- **SC-004**: The LM Studio provider adds no new required environment variables beyond `MODEL_PROVIDER` and `MODEL_ID` for the default local setup (i.e., the operator can get started with exactly two env vars).
- **SC-005**: All existing providers continue to work correctly after this change is introduced — zero regressions for currently supported providers.

## Assumptions

- LM Studio is already installed and a model is downloaded on the operator's machine before Sirimath AI is started with `MODEL_PROVIDER=lmstudio`.
- The LM Studio local server runs without authentication by default; if an operator has enabled authentication, they can supply a token via a future enhancement (out of scope here).
- The feature follows the same operator-facing configuration pattern as the existing local provider option: selecting LM Studio requires only environment variable changes, no code modifications by operators.
- Only the chat/language model capability is in scope for the initial release. Embedding support via LM Studio is a potential follow-on feature.
- Default model ID when `MODEL_ID` is not set is intentionally not defined for LM Studio; operators must always specify a model because there is no universal "default" local model.
