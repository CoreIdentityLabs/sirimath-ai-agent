# Tasks: Telegram Voice Messages — STT & TTS

**Input**: Design documents from `/specs/003-telegram-voice-stt-tts/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install the new voice dependency required by this feature

- [X] T001 Install `@voltagent/voice` dependency in package.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Voice provider resolution and updated function signatures that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Create `resolveVoiceProvider()` function with OpenAI provider support, graceful fallbacks for unsupported/missing/misconfigured providers, and a startup log message confirming voice provider type, STT model, TTS model, and voice name on successful initialization in src/config/voice-provider.ts. Note: any `as any` casts on voice/model options MUST include an inline comment per Constitution Principle II (e.g., `// OpenAIVoice is a string union; env var is untyped`)
- [X] T003 [P] Update `startTelegramBot()` signature to accept optional `voiceProvider?: Voice | null` parameter and conditionally register voice handlers before the existing fallback in src/channels/telegram.ts
- [X] T004 Update src/index.ts to import `resolveVoiceProvider`, call it at startup, and pass the result to `startTelegramBot(agent, logger, voiceProvider)`

**Checkpoint**: Foundation ready — voice provider resolves at startup (or returns null), Telegram adapter accepts it, entry point wires them together

---

## Phase 3: User Story 1 — Receive Voice Message and Reply with Text (Priority: P1) 🎯 MVP

**Goal**: Users send voice messages to the bot; they are transcribed via STT, processed through the agent, and replied to with text

**Independent Test**: Send a voice message saying "What's the weather in Colombo?" to the Telegram bot and verify a relevant text reply appears in the chat

### Implementation for User Story 1

- [X] T005 [US1] Implement voice file download from Telegram API (ctx.api.getFile → fetch → Buffer) in the message:voice handler in src/channels/telegram.ts
- [X] T006 [US1] Implement STT transcription via `voiceProvider.listen()` using Buffer→ReadableStream bridge and agent text processing via `agent.generateText()` in the voice handler in src/channels/telegram.ts
- [X] T007 [US1] Add access control check (ALLOWED_TELEGRAM_USER_IDS) and error handling for download failure, STT failure, empty transcript, and agent error with user-friendly replies in src/channels/telegram.ts
- [X] T008 [US1] Register message:audio handler reusing the same voice processing logic as message:voice for audio file attachments in src/channels/telegram.ts (depends on T005–T007)

**Checkpoint**: At this point, voice messages are transcribed and replied to with text. US1 is fully functional and testable independently (STT → Agent → Text Reply)

---

## Phase 4: User Story 2 — Reply with Voice Message / TTS (Priority: P2)

**Goal**: After processing a voice message, the bot replies with a TTS-generated voice note alongside a text follow-up

**Independent Test**: Send a voice message and verify the reply arrives as both a Telegram voice message (audio playback) and a text message with the same response content

### Implementation for User Story 2

- [X] T009 [US2] Add TTS voice reply generation via `voiceProvider.speak()` with stream→Buffer collection and `ctx.replyWithVoice(new InputFile(buffer, "reply.ogg"))` in the voice/audio handlers in src/channels/telegram.ts
- [X] T010 [US2] Send text follow-up message alongside voice reply using `splitMessage()` and `ctx.reply()` after voice (FR-006) in src/channels/telegram.ts
- [X] T011 [US2] Add TTS error handling — when `voiceProvider.speak()` fails, skip voice reply and gracefully fall back to text-only response with warning log (FR-011) in src/channels/telegram.ts

**Checkpoint**: At this point, voice messages get both a voice reply and a text follow-up. US1 (STT) and US2 (TTS) are both independently functional

---

## Phase 5: User Story 3 — Azure Voice Provider & Configuration (Priority: P3)

**Goal**: Operators can choose Azure OpenAI as their voice provider (in addition to OpenAI), and voice features degrade gracefully when misconfigured or disabled

**Independent Test**: Start the bot without VOICE_PROVIDER set and verify voice messages get the text-only fallback; restart with VOICE_PROVIDER=azure and valid Azure credentials and verify voice messages are transcribed and replied to with audio

### Implementation for User Story 3

- [X] T012 [P] [US3] Create `AzureVoiceProvider` class extending `BaseVoiceProvider` with `speak()` and `listen()` methods using `AzureOpenAI` client from the `openai` npm package in src/voice/azure-voice-provider.ts. Note: any `as any` casts on voice/model options MUST include an inline comment per Constitution Principle II
- [X] T013 [US3] Add `azure` case with `AZURE_API_KEY` and `AZURE_RESOURCE_NAME` credential validation to `resolveVoiceProvider()` in src/config/voice-provider.ts

**Checkpoint**: All three user stories are independently functional — OpenAI voice, Azure voice, and graceful text-only fallback when unconfigured (startup log already implemented in T002)

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and validation across all user stories

- [X] T014 [P] Update .env.example with VOICE_PROVIDER, TTS_MODEL, TTS_VOICE, STT_MODEL, AZURE_API_KEY, and AZURE_RESOURCE_NAME variables
- [X] T015 Run quickstart.md end-to-end validation (both OpenAI and Azure paths). Verify voice round-trip completes within 15 seconds for a ~10-second voice message (SC-001)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–5)**: All depend on Foundational phase completion
  - US1 (Phase 3) → US2 (Phase 4) must be sequential (TTS extends the voice handler built for STT)
  - US3 (Phase 5) can start after Phase 2, independent of US1/US2 (different files)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 — TTS extends the voice handler pipeline built for STT
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) — independent of US1/US2 (creates new file + extends voice-provider.ts)

### Within Each User Story

- Core implementation before error handling
- Handler registration before pipeline logic
- Voice handler before audio handler (audio reuses voice logic)

### Parallel Opportunities

- T002 and T003 can run in parallel (different new/modified files)
- T008 (audio handler) depends on T005–T007 (reuses shared voice processing logic)
- T012 (AzureVoiceProvider) can run in parallel with all US1/US2 tasks — completely independent new file
- T014 (.env.example) can run in parallel with T015 (quickstart validation)
- **US1 and US3 can proceed in parallel** after Phase 2 (different files: telegram.ts vs azure-voice-provider.ts + voice-provider.ts)

---

## Parallel Example: Foundational Phase

```
# These touch different files — launch in parallel:
T002: Create resolveVoiceProvider() in src/config/voice-provider.ts
T003: Update startTelegramBot() signature in src/channels/telegram.ts

# Then sequentially:
T004: Update src/index.ts (depends on T002 + T003)
```

## Parallel Example: US1 + US3

```
# After Phase 2, these can run in parallel (different files):
──── US1 Track ────
T005: Voice download in src/channels/telegram.ts
T006: STT + agent in src/channels/telegram.ts
T007: Error handling in src/channels/telegram.ts
T008: Audio handler in src/channels/telegram.ts

──── US3 Track ────
T012: AzureVoiceProvider in src/voice/azure-voice-provider.ts
T013: Azure case in src/config/voice-provider.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (install dependency)
2. Complete Phase 2: Foundational (voice provider + updated signatures)
3. Complete Phase 3: User Story 1 (STT → Agent → Text Reply)
4. **STOP and VALIDATE**: Send a voice message, verify text reply
5. Deploy/demo if ready — voice input with text output is independently valuable

### Incremental Delivery

1. Setup + Foundational → Voice provider wiring ready
2. Add US1 → Test STT independently → Deploy/Demo (MVP!)
3. Add US2 → Test TTS independently → Deploy/Demo (full voice loop)
4. Add US3 → Test Azure config → Deploy/Demo (multi-provider BYOK)
5. Each story adds value without breaking previous stories

### File Change Summary

| File                              | Phase   | Change                                                                               |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| package.json                      | 1       | Add `@voltagent/voice` dependency                                                    |
| src/config/voice-provider.ts      | 2, 5    | NEW: `resolveVoiceProvider()` with OpenAI (Phase 2) + Azure (Phase 5)                |
| src/channels/telegram.ts          | 2, 3, 4 | MODIFIED: Updated signature (Phase 2), voice/audio handlers (Phase 3), TTS (Phase 4) |
| src/index.ts                      | 2       | MODIFIED: Import + call `resolveVoiceProvider()`, pass to `startTelegramBot()`       |
| src/voice/azure-voice-provider.ts | 5       | NEW: `AzureVoiceProvider` class                                                      |
| .env.example                      | 6       | MODIFIED: Add voice environment variables                                            |

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after its phase checkpoint
- No test tasks included — tests were not requested in the specification
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The voice handler logic in US1 (T005–T008) is extended in-place by US2 (T009–T011) — same handler, added pipeline steps
