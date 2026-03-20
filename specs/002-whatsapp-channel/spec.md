# Feature Specification: WhatsApp Communication Channel

**Feature Branch**: `002-whatsapp-channel`  
**Created**: 2026-03-20  
**Status**: Draft  
**Input**: User description: "Currently Sirimath AI only communicates through Telegram. I need to extend his communication channel to WhatsApp as well."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Chat with Sirimath AI via WhatsApp (Priority: P1)

A user opens WhatsApp on their phone, finds the Sirimath AI number (or scans a QR code), and sends a text message (e.g., "What's the weather like in Colombo?"). The assistant reads the message, processes it through the existing VoltAgent agent, and replies within the same WhatsApp chat. The conversation is persistent — the user can send follow-up messages and the assistant remembers prior context within the same conversation thread. All existing agent capabilities (weather lookup, URL fetching, web search, skill discovery) work identically to the Telegram experience.

**Why this priority**: Without WhatsApp message handling, the entire feature has no user-facing value. This is the foundational slice that proves end-to-end connectivity: WhatsApp → Agent → LLM → WhatsApp. It reuses the existing agent, tools, and memory — the only new work is the channel adapter.

**Independent Test**: Can be fully tested by sending messages to the WhatsApp bot number and verifying replies appear in the chat. Delivers a working conversational assistant accessible from any WhatsApp client (mobile, desktop, web).

**Acceptance Scenarios**:

1. **Given** the service is running and WhatsApp credentials are configured, **When** a user sends "Hello" to the bot via WhatsApp, **Then** the bot replies with a relevant greeting within the same chat.
2. **Given** the user has sent two previous messages in the conversation, **When** the user sends a follow-up that references prior context (e.g., "Tell me more about that"), **Then** the assistant responds with context-aware content drawing from the conversation history.
3. **Given** the service is running, **When** a user sends a very long message, **Then** the assistant processes it and replies (splitting the response into multiple WhatsApp messages if the reply exceeds WhatsApp's message length limit).
4. **Given** the service is running, **When** the LLM provider returns an error (e.g., rate limit, invalid key), **Then** the bot replies with a user-friendly error message informing the user to try again later.
5. **Given** both Telegram and WhatsApp channels are running, **When** a user sends the same question on both platforms, **Then** both channels respond correctly and independently — each maintains its own conversation history scoped by channel.

---

### User Story 2 - Receive WhatsApp Messages via Webhook (Priority: P2)

The operator deploys Sirimath AI to a server with a public URL. WhatsApp delivers incoming messages to a webhook endpoint hosted by the service. The operator configures their WhatsApp Business API provider with the webhook URL and a verification token. The service verifies webhook registration requests and processes incoming message events.

**Why this priority**: WhatsApp does not support long-polling like Telegram. A webhook endpoint is mandatory for receiving messages in production. This story is independently valuable because it establishes the connection pathway between WhatsApp infrastructure and the service.

**Independent Test**: Can be tested by configuring the webhook URL in the WhatsApp Business API provider dashboard, sending a verification challenge, and confirming the service responds correctly. Then sending a message and confirming it arrives at the service.

**Acceptance Scenarios**:

1. **Given** the service is running and a webhook URL is configured, **When** the WhatsApp provider sends a GET verification challenge with the correct verify token, **Then** the service responds with the challenge token to confirm registration.
2. **Given** the webhook is verified, **When** a user sends a text message via WhatsApp, **Then** the service receives the webhook POST, extracts the message text, sender ID, and conversation ID, and forwards them to the agent.
3. **Given** the webhook is verified, **When** a webhook POST arrives with an invalid or missing signature, **Then** the service rejects it and logs the attempt without processing the message.

---

### User Story 3 - Restrict Access to Authorized WhatsApp Users (Priority: P3)

The operator wants to restrict the WhatsApp bot to specific phone numbers (similar to the Telegram allowlist). They configure `ALLOWED_WHATSAPP_PHONE_NUMBERS` as a comma-separated list of phone numbers. Only messages from those numbers are processed; others receive a polite access-denied reply.

**Why this priority**: Access control is important for a personal assistant but not required for basic functionality. The bot works in open mode by default, and access restriction is an optional hardening layer.

**Independent Test**: Can be tested by setting the allowlist environment variable, sending messages from an allowed number (should get a response) and an unauthorized number (should get an access-denied reply).

**Acceptance Scenarios**:

1. **Given** `ALLOWED_WHATSAPP_PHONE_NUMBERS` is set to a comma-separated list, **When** a user whose number is in the list sends a message, **Then** the message is processed normally.
2. **Given** `ALLOWED_WHATSAPP_PHONE_NUMBERS` is set, **When** a user whose number is NOT in the list sends a message, **Then** the bot replies with "Sorry, you don't have access to this assistant."
3. **Given** `ALLOWED_WHATSAPP_PHONE_NUMBERS` is not set, **When** any user sends a message, **Then** all messages are processed (open mode).

---

### Edge Cases

- What happens when WhatsApp credentials (API token, phone number ID) are missing? The service logs a clear error with instructions and continues running — the WhatsApp channel is simply not started, while Telegram and other channels remain operational.
- What happens when the user sends media (photo, voice, document) instead of text? The assistant replies that it currently supports text messages only.
- What happens when the WhatsApp API rate limit is hit while sending replies? The service logs the rate limit error and retries with appropriate backoff, or informs the user to try again shortly.
- What happens when the webhook verification token is incorrect? The service rejects the verification request and logs a warning.
- What happens when Telegram is disabled but WhatsApp is enabled? Each channel operates independently — the service starts only the configured channels.
- What happens when the same user contacts the bot on both Telegram and WhatsApp? Each channel maintains separate conversation histories — there is no cross-channel identity linking.
- What happens when the WhatsApp reply exceeds the message size limit? The adapter splits the response into multiple sequential messages, similar to the Telegram adapter behavior.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST accept text messages from WhatsApp users via the WhatsApp Business API and forward them to the existing VoltAgent agent for processing.
- **FR-002**: The system MUST send the agent's response back to the originating WhatsApp chat as a text reply.
- **FR-003**: The system MUST maintain per-user conversation history using VoltAgent's Memory system, scoped by WhatsApp phone number as the `userId` and WhatsApp chat ID as the `conversationId`.
- **FR-004**: The system MUST expose a webhook endpoint for receiving incoming WhatsApp messages, registered with the service's existing Hono HTTP server.
- **FR-005**: The system MUST handle WhatsApp webhook verification (GET request with challenge token and verify token) to complete the webhook registration handshake.
- **FR-006**: The system MUST validate incoming webhook payloads using the WhatsApp-provided signature to prevent spoofed messages.
- **FR-007**: The WhatsApp channel adapter MUST reside in `src/channels/whatsapp.ts` and MUST NOT contain agent logic, LLM configuration, or tool definitions — it only translates between the WhatsApp API protocol and VoltAgent agent invocations, following the same pattern as the Telegram adapter.
- **FR-008**: The system MUST reply with a user-friendly error message when the LLM provider returns an error (rate limit, auth failure, timeout), rather than exposing technical details.
- **FR-009**: The system MUST reply with a "text messages only" notice when a WhatsApp user sends unsupported media types (photos, voice notes, documents, stickers, location).
- **FR-010**: The system MUST optionally restrict access to specified WhatsApp phone numbers via the `ALLOWED_WHATSAPP_PHONE_NUMBERS` environment variable (comma-separated). When set, unauthorized users receive a polite access-denied reply.
- **FR-011**: The system MUST split agent responses exceeding WhatsApp's message size limit into multiple sequential messages.
- **FR-012**: The WhatsApp channel MUST be independently startable — if WhatsApp credentials are not configured, the channel is skipped and other channels (Telegram) continue to function normally.
- **FR-013**: The WhatsApp adapter MUST follow the same function signature pattern as the Telegram adapter: `startWhatsAppBot(agent, logger, app)` where `app` is the Hono application instance for registering webhook routes.
- **FR-014**: All existing agent capabilities (weather lookup, URL fetching, web search, skill discovery and installation) MUST work identically through the WhatsApp channel without any modifications to agent, tool, or workflow code.
- **FR-015**: The system MUST read WhatsApp configuration from environment variables: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, and optionally `WHATSAPP_APP_SECRET` for webhook signature validation.

### Key Entities

- **WhatsApp Channel Adapter**: A module that translates between the WhatsApp Business API webhook events and VoltAgent agent method calls. Follows the same structural pattern as the Telegram adapter. Decoupled from agent and tool logic.
- **Webhook Endpoint**: An HTTP route registered on the existing Hono server that receives incoming WhatsApp messages and verification challenges. No separate server is required.
- **WhatsApp Conversation**: A persistent dialogue thread between a WhatsApp user and the agent, identified by the user's phone number and chat ID. Stores message history for context continuity, independent from Telegram conversations.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can send a text message via WhatsApp and receive a contextually relevant reply within 10 seconds (excluding LLM processing time variability).
- **SC-002**: All existing agent capabilities (weather, URL fetch, web search, skill discovery) work through WhatsApp with the same quality as Telegram — no feature gaps between channels.
- **SC-003**: Multi-turn conversations on WhatsApp maintain context for at least 20 exchanges, with the assistant accurately referencing earlier messages.
- **SC-004**: The WhatsApp channel operates independently from Telegram — disabling one channel does not affect the other.
- **SC-005**: Adding the WhatsApp channel requires zero changes to existing agent, tool, memory, or workflow code — only new files under `src/channels/` and a registration call in the entry point.
- **SC-006**: The assistant gracefully handles all WhatsApp-specific error conditions (invalid token, API rate limits, webhook verification failures) without crashing — structured error messages are logged and user-friendly messages are sent to the chat.
- **SC-007**: Webhook signature validation correctly rejects 100% of spoofed or tampered payloads while accepting all legitimate messages.

## Assumptions

- The operator has a WhatsApp Business API account (either via Meta Cloud API or a Business Solution Provider).
- The operator has obtained a WhatsApp access token and phone number ID from the Meta developer dashboard.
- The service is deployed with a publicly accessible HTTPS URL for webhook registration (WhatsApp requires HTTPS).
- The existing Hono HTTP server (used by VoltAgent for observability and APIs) can host the WhatsApp webhook routes without a separate server.
- The WhatsApp Business API follows the Meta Graph API message format for sending and receiving messages.
- The operator is responsible for WhatsApp Business API compliance (message templates for initiating conversations outside the 24-hour window, business verification, etc.) — this is outside the scope of the assistant's functionality.
- WhatsApp's message size limit for text is approximately 4096 characters (similar to Telegram); the adapter will split longer responses.
