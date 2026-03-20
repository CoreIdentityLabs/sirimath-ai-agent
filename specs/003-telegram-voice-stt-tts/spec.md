# Feature Specification: Telegram Voice Messages — STT & TTS

**Feature Branch**: `003-telegram-voice-stt-tts`  
**Created**: 2026-03-20  
**Status**: Draft  
**Input**: User description: "Extend Telegram communication to support voice messages — STT for incoming voice recordings and TTS for outgoing replies"

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Receive Voice Message and Reply with Text (Priority: P1)

A Telegram user records and sends a voice message to the assistant. The assistant downloads the voice audio file from Telegram, converts it to text using a speech-to-text service, processes the transcribed text through the VoltAgent agent (identically to a typed text message), and replies with the agent's text response in the same chat. The user sees a normal text reply — the voice message is treated as an alternative input method to typing.

**Why this priority**: This is the foundational voice capability. Without STT, the assistant cannot understand voice messages at all. It unlocks hands-free interaction and accessibility for users who prefer speaking. It builds directly on the existing text pipeline — only the input method changes.

**Independent Test**: Can be fully tested by sending a voice message saying "What's the weather in Colombo?" to the Telegram bot and verifying a relevant text reply appears in the chat. Delivers voice-to-text input without requiring TTS output.

**Acceptance Scenarios**:

1. **Given** the bot is running with a valid STT provider configured, **When** a user sends a voice message (Telegram voice note) containing clear speech, **Then** the bot transcribes the audio to text, processes it through the agent, and replies with a text response in the same chat.
2. **Given** the bot is running, **When** a user sends a voice message with background noise or unclear speech, **Then** the bot attempts transcription and either responds based on the best-effort transcript or replies with a polite message indicating it could not understand the audio clearly.
3. **Given** the bot is running, **When** a user sends a voice message that is very long (over 2 minutes), **Then** the bot transcribes and processes the full audio content without truncation, up to the STT provider's maximum supported duration.
4. **Given** the bot is running, **When** the STT service is unavailable or returns an error, **Then** the bot replies with a user-friendly message (e.g., "I couldn't process your voice message right now. Please try again or send a text message instead.").
5. **Given** the bot has an existing text conversation with the user, **When** the user sends a voice message as a follow-up, **Then** the transcribed text is processed with full conversation context (memory), just as if the user had typed it.

---

### User Story 2 — Reply with Voice Message (TTS) (Priority: P2)

After the assistant generates a text response (whether the user's input was text or voice), the assistant converts its reply to speech using a text-to-speech service and sends it back as a Telegram voice message. This enables a fully voice-based conversational experience — the user speaks, and the assistant speaks back.

**Why this priority**: TTS completes the voice conversation loop. It depends on STT (P1) being functional for the full voice experience, though it can also enhance text-input conversations. It is independently valuable because users in hands-free scenarios (driving, cooking) benefit from audio replies even when they typed their question.

**Independent Test**: Can be tested by sending any message (text or voice) to the bot and verifying the reply arrives as a Telegram voice message (audio) that, when played, speaks the assistant's response. Can also verify text replies still work alongside or as fallback.

**Acceptance Scenarios**:

1. **Given** the bot is running with a valid TTS provider configured, **When** a user sends a voice message, **Then** the bot replies with a voice message containing the spoken version of the agent's text response.
2. **Given** the bot is running with TTS enabled, **When** a user sends a text message, **Then** the bot replies with a text message (existing behavior unchanged — TTS voice replies are only sent in response to voice input).
3. **Given** the agent's response is very long (over 4000 characters), **When** the response is converted to speech, **Then** the bot sends the full response as a single voice message (or multiple voice messages if the TTS provider has duration limits), without truncating content.
4. **Given** the TTS service is unavailable or returns an error, **When** the bot attempts to generate a voice reply, **Then** the bot falls back to sending the response as a plain text message and logs a warning.
5. **Given** the bot is running with TTS enabled, **When** a user sends a voice message, **Then** the bot also includes the text transcription of its reply as a caption or separate text message alongside the voice reply, so the user can read it if they prefer.

---

### User Story 3 — Configure Voice Provider via Environment Variables (Priority: P3)

The operator (developer) wants to choose which STT and TTS provider to use, or disable voice features entirely. They configure environment variables to select the voice provider (OpenAI or Azure) and provide the necessary API keys. If voice environment variables are not set, voice features are gracefully disabled and the bot continues to work with text-only mode (existing behavior). This ensures BYOK flexibility extends to voice services — operators already using Azure AI Foundry for LLM can also use Azure for voice without needing a separate OpenAI key.

**Why this priority**: Configuration flexibility is important for cost control and provider choice, but it depends on the voice pipeline (P1/P2) existing first. Two providers at launch (OpenAI and Azure) cover the most common enterprise and individual setups.

**Independent Test**: Can be tested by starting the bot without voice provider configuration and verifying voice messages get a text-only fallback response, then restarting with voice provider configured and verifying voice messages are transcribed and replied to with audio.

**Acceptance Scenarios**:

1. **Given** no voice provider environment variables are set, **When** a user sends a voice message, **Then** the bot replies with a text message saying it currently supports text messages only (existing fallback behavior preserved).
2. **Given** `VOICE_PROVIDER=openai` and a valid `OPENAI_API_KEY` are set, **When** the bot starts, **Then** voice processing is enabled and the bot can transcribe and synthesize speech.
3. **Given** `VOICE_PROVIDER=azure` and valid `AZURE_API_KEY` and `AZURE_RESOURCE_NAME` are set, **When** the bot starts, **Then** voice processing is enabled using Azure OpenAI's Whisper and TTS deployments.
4. **Given** `VOICE_PROVIDER` is set to an unsupported value, **When** the bot starts, **Then** it logs a warning listing supported voice providers and falls back to text-only mode (does not crash).
5. **Given** `VOICE_PROVIDER=openai` but `OPENAI_API_KEY` is missing, **When** the bot starts, **Then** it logs a clear error about the missing API key for the voice provider and falls back to text-only mode.
6. **Given** `VOICE_PROVIDER=azure` but `AZURE_RESOURCE_NAME` is missing, **When** the bot starts, **Then** it logs a clear error about the missing resource name and falls back to text-only mode.

---

### Edge Cases

- What happens when the user sends a video note (round video message) instead of a voice note? **Deferred** — video notes require extracting the audio track from an MP4 container, which adds an `ffmpeg` or similar dependency. Out of scope for launch; the bot replies with the existing text-only fallback for video notes.
- What happens when the user sends an audio file (e.g., an MP3 attachment) rather than a voice recording? The bot treats uploaded audio files the same as voice messages — transcribes and processes them.
- What happens when the Telegram voice file download fails (e.g., network error, file expired)? The bot replies with a message asking the user to re-send the voice message.
- What happens when the voice message is empty or contains only silence? The STT provider returns an empty or near-empty transcript; the bot replies politely asking the user to try again.
- What happens when the voice message is in a language other than English? The STT provider transcribes in the detected language; the agent processes and responds accordingly (language handling depends on the LLM's capabilities).
- What happens when voice features are enabled but the user's access is unauthorized (not in `ALLOWED_TELEGRAM_USER_IDS`)? The same access control applies — the bot replies with the access-denied message, regardless of whether the input was voice or text.
- What happens when the TTS output audio file is too large for Telegram's upload limit (50 MB)? For typical text responses this is unlikely; if it occurs, the bot falls back to text reply and logs a warning.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST detect incoming Telegram voice messages (`message:voice`) and process them through a speech-to-text pipeline before forwarding the transcribed text to the VoltAgent agent.
- **FR-002**: The system MUST download voice message audio files from the Telegram Bot API using the file ID provided in the voice message update.
- **FR-003**: The system MUST convert downloaded audio to text using a configurable STT provider service.
- **FR-004**: The transcribed text MUST be processed through the VoltAgent agent with the same `userId` and `conversationId` scoping as text messages, preserving full conversation history and context.
- **FR-005**: When voice input is received, the system MUST convert the agent's text response to speech using a configurable TTS provider service and send the audio back as a Telegram voice message.
- **FR-006**: When TTS is used, the system MUST also provide the agent's text response alongside the voice reply (as a caption or follow-up text message) so users can read the response.
- **FR-007**: The voice provider MUST be configurable via a `VOICE_PROVIDER` environment variable. When not set or empty, voice features are disabled and the bot operates in text-only mode.
- **FR-008**: The system MUST support at minimum two voice providers at launch: OpenAI (using `OPENAI_API_KEY`) and Azure OpenAI (using `AZURE_API_KEY` + `AZURE_RESOURCE_NAME`), both providing STT (Whisper) and TTS capabilities.
- **FR-008a**: When `VOICE_PROVIDER=azure`, the system MUST use Azure OpenAI Service endpoints for Whisper (STT) and TTS, reusing the same `AZURE_API_KEY` and `AZURE_RESOURCE_NAME` already configured for the LLM provider.
- **FR-009**: When voice features are disabled (no `VOICE_PROVIDER` set), incoming voice messages MUST trigger the existing fallback reply ("I currently support text messages only.").
- **FR-010**: When the STT service fails, the system MUST reply with a user-friendly error message and NOT crash or leave the message unanswered.
- **FR-011**: When the TTS service fails, the system MUST fall back to sending the agent's response as a plain text message.
- **FR-012**: Existing text message handling MUST remain unchanged — text input always receives text output, regardless of whether voice features are enabled.
- **FR-013**: The same access control rules (`ALLOWED_TELEGRAM_USER_IDS`) MUST apply to voice messages as to text messages.
- **FR-014**: Voice processing logic MUST reside within `src/channels/telegram.ts` (Telegram protocol layer) and a dedicated voice service module — it MUST NOT be embedded in agent logic, tool definitions, or model provider configuration.
- **FR-015**: The system MUST handle Telegram audio file messages (`message:audio`) in addition to voice notes (`message:voice`), treating both as voice input.

### Key Entities

- **Voice Message**: An incoming Telegram voice note or audio file; key attributes: file ID, duration, MIME type, file size.
- **Transcription**: The text output from STT processing of a voice message; associated with a user, conversation, and the original voice message.
- **Voice Reply**: The TTS-generated audio sent back to the user; derived from the agent's text response, delivered as a Telegram voice message.
- **Voice Provider Configuration**: The operator-level settings that determine which STT/TTS service is used; includes provider name, API credentials, and optional model/voice preferences.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can send a voice message and receive a relevant, accurate reply within 15 seconds (inclusive of STT processing, agent reasoning, and TTS generation) for messages under 30 seconds in duration.
- **SC-002**: Manual validation of 10 diverse voice messages (varied phrasing, normal speaking pace, quiet environment) yields at least 9 transcriptions accurate enough for the agent to produce a correct response.
- **SC-003**: TTS voice replies play back at correct speed without audio artifacts — the spoken text matches the text follow-up message word-for-word.
- **SC-004**: When voice features are disabled, the bot's existing text-only behavior is completely unaffected — no regressions in response time, accuracy, or reliability.
- **SC-005**: Voice feature failures (STT or TTS errors) never result in unanswered messages — the user always receives either a voice reply, a text fallback, or an informative error message.
- **SC-006**: Voice features can be enabled or disabled purely through environment variable changes with no code modifications required.

## Assumptions

- The operator already has an OpenAI API key configured (as it is the default LLM provider), which also supports OpenAI's Whisper (STT) and TTS APIs. Alternatively, operators using Azure AI Foundry already have Azure credentials configured.
- Telegram voice notes are delivered in OGG/Opus format, which is compatible with both OpenAI's and Azure OpenAI's Whisper API without format conversion.
- The VoltAgent `@voltagent/voice` package provides the STT and TTS abstraction layer, with `OpenAIVoiceProvider` supporting both `speak()` and `listen()` methods. For Azure, a thin `AzureVoiceProvider` extends the same `BaseVoiceProvider` base class using the `AzureOpenAI` client from the `openai` npm package (already a transitive dependency).
- Azure OpenAI Service hosts the same Whisper and TTS-1 models as OpenAI, accessible via the `openai` npm package's `AzureOpenAI` class. The API surface (`.audio.transcriptions.create()` and `.audio.speech.create()`) is identical.
- Voice message processing adds acceptable latency (under 10 seconds for STT + TTS combined) for messages of typical conversational length (under 60 seconds).
- The TTS voice and model selection (e.g., OpenAI voice "alloy", model "tts-1") will use sensible defaults that can optionally be overridden via environment variables (`TTS_VOICE`, `TTS_MODEL`, `STT_MODEL`). For Azure, the model names correspond to Azure deployment names.
