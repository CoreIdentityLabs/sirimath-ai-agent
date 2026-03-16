# Tasks: Telegram BYOK Personal Assistant with Skill Discovery

**Input**: Design documents from `/specs/001-telegram-byok-assistant/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Not requested — spec specifies manual integration testing via Telegram.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/` at repository root (per plan.md Structure Decision)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies and create environment configuration

- [X] T001 Install runtime dependencies: `grammy` and `@ai-sdk/openai` via `npm install grammy @ai-sdk/openai`
- [X] T002 [P] Create `.env.example` at repository root documenting all environment variables per data-model.md env vars table — include TELEGRAM_BOT_TOKEN, TELEGRAM_MODE, MODEL_PROVIDER, MODEL_ID, all provider API keys, ALLOWED_TELEGRAM_USER_IDS, and VoltOps keys with comments explaining each

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: BYOK model resolution and agent bootstrap updates — MUST complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create `src/config/model-provider.ts` — implement `resolveModel(): Promise<LanguageModel>` per contracts/model-provider.md with: `SUPPORTED_PROVIDERS` const, `ProviderName` type export, dynamic import switch for all 7 providers (openai, anthropic, google, azure, groq, mistral, ollama), default fallback to openai/gpt-4o-mini, unsupported provider validation with descriptive error + process.exit(1), Azure `AZURE_RESOURCE_NAME` check
- [X] T004 Update `src/index.ts` — add `import { resolveModel } from "./config/model-provider"`, add top-level `const model = await resolveModel()`, replace hardcoded `model: "openai/gpt-4o-mini"` with dynamic `model`, import `weatherTool` from `./tools` and add to `tools: [weatherTool]`, update agent `instructions` to describe the assistant's capabilities (chat, weather, skill discovery)

**Checkpoint**: Foundation ready — `npm run dev` should start with the configured provider, agent uses dynamic model. User story implementation can now begin.

---

## Phase 3: User Story 1 — Chat with the Assistant via Telegram (Priority: P1) 🎯 MVP

**Goal**: A user sends a text message via Telegram, the agent processes it and replies in the same chat. Conversation history is persistent per user via LibSQL memory. Non-text messages get a fallback notice. Access control is optionally enforced. Responses >4096 chars are split into multiple messages.

**Independent Test**: Send messages to the Telegram bot via any Telegram client and verify replies appear.

### Implementation for User Story 1

- [X] T005 [US1] Create `src/channels/telegram.ts` per contracts/telegram-adapter.md — export `startTelegramBot(agent: Agent, logger: Logger): Promise<void>` that: (1) reads TELEGRAM_BOT_TOKEN from env (exit if missing), (2) creates grammy `Bot` instance, (3) parses ALLOWED_TELEGRAM_USER_IDS into Set<string> for access control, (4) registers `bot.on("message:text")` handler that checks access control then calls `agent.generateText(text, { userId: ctx.from.id.toString(), conversationId: ctx.chat.id.toString() })`, splits response via `splitMessage(text, 4096)` helper that splits on `\n\n` paragraph boundaries first, then `\n` line boundaries, then word boundaries as a last resort — sending each chunk sequentially, and replies with each chunk, (5) registers `bot.on("message")` fallback for non-text media with "text messages only" notice (FR-014), (6) registers `bot.catch()` for global error logging, (7) wraps agent.generateText in try/catch for LLM errors → user-friendly reply (FR-013), (8) starts bot in polling or webhook mode based on TELEGRAM_MODE env var
- [X] T006 [US1] Wire Telegram bot into `src/index.ts` — add `import { startTelegramBot } from "./channels/telegram"`, call `startTelegramBot(agent, logger)` after the `new VoltAgent({...})` bootstrap

**Checkpoint**: User Story 1 fully functional — Telegram users can chat with the assistant, conversation history persists, non-text media is handled, access control works, errors are graceful.

---

## Phase 4: User Story 2 — Switch LLM Provider via Environment Configuration (Priority: P2)

**Goal**: The operator switches the LLM provider by changing only `MODEL_PROVIDER` and `MODEL_ID` environment variables and restarting. No code changes. At least 7 providers supported.

**Independent Test**: Set `MODEL_PROVIDER=anthropic` + `MODEL_ID=claude-sonnet-4-20250514` + `ANTHROPIC_API_KEY`, restart, verify bot responds via Telegram. Repeat for google, groq, etc.

### Implementation for User Story 2

- [X] T007 [US2] Add provider-specific API key validation to `src/config/model-provider.ts` — before each dynamic import, check that the required env var exists (e.g., `OPENAI_API_KEY` for openai, `ANTHROPIC_API_KEY` for anthropic, `GOOGLE_GENERATIVE_AI_API_KEY` for google, `GROQ_API_KEY` for groq, `MISTRAL_API_KEY` for mistral). Azure validation (`AZURE_API_KEY` + `AZURE_RESOURCE_NAME`) is already handled in T003 — do not duplicate. If missing, log the specific missing variable name and exit with `process.exit(1)` per FR-008. Ollama has no required key.
- [X] T008 [P] [US2] Install optional provider packages: `npm install @ai-sdk/anthropic @ai-sdk/google @ai-sdk/groq @ai-sdk/mistral ollama-ai-provider-v2` and update `.env.example` with provider switching examples (one commented block per provider showing MODEL_PROVIDER, MODEL_ID, and required API key)

**Checkpoint**: User Story 2 complete — operator can switch between any of the 7 providers by editing .env and restarting.

---

## Phase 5: User Story 3 — Use Azure AI Foundry Models (Priority: P3)

**Goal**: Azure AI Foundry models work as a first-class provider. Configuration via `AZURE_RESOURCE_NAME`, `AZURE_API_KEY`, and `MODEL_ID` (deployment name). User experience identical to other providers.

**Independent Test**: Set `MODEL_PROVIDER=azure` + Azure env vars, restart, verify bot responds via Telegram using the Azure-hosted model.

### Implementation for User Story 3

- [X] T009 [US3] Install `@ai-sdk/azure` via `npm install @ai-sdk/azure` and verify the azure case in `src/config/model-provider.ts` validates both `AZURE_RESOURCE_NAME` and `AZURE_API_KEY` with descriptive error messages. Add `.env.example` Azure section with `AZURE_RESOURCE_NAME` and `AZURE_API_KEY` placeholders alongside existing `MODEL_PROVIDER=azure` and `MODEL_ID` entries.

**Checkpoint**: User Story 3 complete — Azure AI Foundry works identically to other providers.

---

## Phase 6: User Story 4 — Discover and Install Skills (Priority: P4)

**Goal**: Users ask the assistant to find skills (e.g., "find a skill for react best practices"), the assistant searches skills.sh, presents results with security audit scores, and installs selected skills to `./skills/` upon confirmation.

**Independent Test**: Send "find a skill for web scraping" via Telegram, verify formatted results with security scores, select one, confirm installation appears in `./skills/`.

### Implementation for User Story 4

- [X] T010 [P] [US4] Create `src/tools/find-skills.ts` per contracts/skill-tools.md — export `findSkillsTool` via `createTool` with: name "findSkills", Zod input schema `{ query: z.string().min(1) }`, execute handler that (1) fetches `https://skills.sh/api/search?q=${encodeURIComponent(query)}` via fetch(), (2) fetches `https://skills.sh/audits` for security audit markdown, (3) parses audit markdown to extract Gen Agent Trust Hub / Socket / Snyk scores per skill matched by skillId and source, (4) cross-references search results with audit data, (5) returns formatted numbered table string with columns: #, Skill, Publisher, Installs, Gen, Socket, Snyk — sorted by installs descending, installs formatted as K/M, security icons (✅/⚠️/🔴), footer with browse link and "pick a number" prompt. Handle API errors gracefully (return "temporarily unavailable" message), no results (return "no matching skills"), audit fetch failure (show "⚠️ Audit unavailable").
- [X] T011 [P] [US4] Create `src/tools/install-skill.ts` per contracts/skill-tools.md — export `installSkillTool` via `createTool` with: name "installSkill", Zod input schema `{ skillId: z.string().min(1), source: z.string().min(1), name: z.string().min(1) }`, execute handler that (1) fetches SKILL.md from `https://raw.githubusercontent.com/${source}/main/${skillId}/SKILL.md` with fallback to `/master/`, (2) validates: not empty, not HTML, >50 chars, contains `#` heading, (3) parses YAML frontmatter for name/description, (4) creates `./skills/${skillId}/` directory via `fs.mkdir` with `recursive: true`, (5) writes SKILL.md content to `./skills/${skillId}/SKILL.md`, (6) writes `_meta.json` to `./skills/${skillId}/_meta.json` with `{ slug, name, description, source, version: "1.0.0", installedAt: new Date().toISOString() }`, (7) returns success message or descriptive error. Use Node.js `fs/promises` for file operations and global `fetch` for HTTP.
- [X] T012 [US4] Update `src/tools/index.ts` — add exports for `findSkillsTool` from `"./find-skills"` and `installSkillTool` from `"./install-skill"`
- [X] T013 [US4] Update `src/index.ts` — import `findSkillsTool` and `installSkillTool` from `"./tools"`, add both to agent's `tools` array alongside `weatherTool`. Update agent `instructions` to include skill discovery guidance: when the user asks to find/discover/search skills or says "how do I do X", use the findSkills tool; when presenting results, show the security table; when user picks a skill, use installSkill after confirming any security warnings.

**Checkpoint**: User Story 4 complete — users can discover and install skills via natural conversation in Telegram.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation completeness

- [X] T014 [P] Validate `.env.example` completeness — cross-check all variables against data-model.md environment variables table, ensure every variable has a descriptive comment and correct default value notation
- [X] T015 Run quickstart.md validation — manually walk through quickstart.md steps (install deps, create .env, npm run dev, send Telegram message, switch provider, discover skill) and verify each step works end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001 for @ai-sdk/openai package) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (T003 for resolveModel, T004 for updated index.ts)
- **US2 (Phase 4)**: Depends on Foundational (T003 for resolveModel base) — can run in parallel with US1
- **US3 (Phase 5)**: Depends on Foundational (T003 for azure case) — can run in parallel with US1/US2
- **US4 (Phase 6)**: Depends on Foundational (T004 for tools registration in index.ts) — can run in parallel with US1
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent after Foundational — delivers end-to-end Telegram ↔ Agent connectivity
- **US2 (P2)**: Independent after Foundational — extends resolveModel() with validation, adds provider packages
- **US3 (P3)**: Independent after Foundational — adds @ai-sdk/azure package, verifies Azure validation
- **US4 (P4)**: Independent after Foundational — adds two new tools and updates barrel export + agent config

### Within Each User Story

- Models/types before services/tools
- Tools before agent configuration (registration)
- Core handler before helper utilities
- Implementation before wiring into index.ts

### Parallel Opportunities

- T001 and T002 can run in parallel (Setup phase)
- T003 and T004 are sequential (T004 imports from T003)
- T005 and T006 are sequential (T006 imports from T005)
- T007 and T008 can run in parallel (US2: T007 edits code, T008 installs packages)
- T010 and T011 can run in parallel (US4: separate new files)
- T012 depends on T010 + T011 (imports from both)
- T013 depends on T012 (imports from barrel)
- Once Foundational completes: US1, US2, US3, US4 implementation phases can start in parallel

---

## Parallel Example: User Story 4

```bash
# Launch both tool files in parallel (no dependencies between them):
Task T010: "Create findSkillsTool in src/tools/find-skills.ts"
Task T011: "Create installSkillTool in src/tools/install-skill.ts"

# Then sequentially:
Task T012: "Update barrel export in src/tools/index.ts"
Task T013: "Wire tools into agent in src/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 2: Foundational (T003, T004)
3. Complete Phase 3: User Story 1 (T005, T006)
4. **STOP and VALIDATE**: Send messages to Telegram bot, verify replies, test conversation memory
5. Deploy/demo if ready — working assistant accessible from any Telegram client

### Incremental Delivery

1. Setup + Foundational → Agent starts with dynamic model ✅
2. Add US1 (Telegram) → Test via Telegram → **MVP!** 🎯
3. Add US2 (BYOK switching) → Test with 3+ providers → Multi-vendor capable
4. Add US3 (Azure) → Test with Azure deployment → Enterprise-ready
5. Add US4 (Skills) → Test skill search + install → Self-extending assistant
6. Polish → Validate quickstart → Release ready

### Suggested MVP Scope

**User Story 1 only** (Phases 1–3, tasks T001–T006): delivers a fully working Telegram assistant with dynamic LLM provider support, conversation memory, message splitting, access control, and error handling. 6 tasks total.
