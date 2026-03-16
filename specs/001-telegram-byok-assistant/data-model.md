# Data Model: Telegram BYOK Personal Assistant

**Feature Branch**: `001-telegram-byok-assistant`  
**Date**: 2026-03-16

---

## Entities

### 1. ProviderConfig

Runtime-resolved LLM provider configuration. Exactly one provider is active at a time.

| Field           | Type                                                                                                          | Source                             | Validation                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------- |
| `provider`      | `ProviderName` (union of `"openai" \| "anthropic" \| "google" \| "azure" \| "groq" \| "mistral" \| "ollama"`) | `MODEL_PROVIDER` env var           | Must be one of the supported values; default `"openai"` |
| `modelId`       | `string`                                                                                                      | `MODEL_ID` env var                 | Non-empty; default `"gpt-4o-mini"`                      |
| `resolvedModel` | `LanguageModel` (from `ai` SDK)                                                                               | Dynamic import of provider package | Must return valid LanguageModel instance                |

**Relationships**: Used by `Agent` as its `model` field. One-to-one with the running service.

**State Transitions**: None — immutable after startup. Changing provider requires restart.

---

### 2. Conversation (VoltAgent Memory)

Managed entirely by `@voltagent/core` `Memory` + `LibSQLMemoryAdapter`. No custom entity needed.

| Field            | Type        | Source                                      | Validation                             |
| ---------------- | ----------- | ------------------------------------------- | -------------------------------------- |
| `userId`         | `string`    | `ctx.from.id.toString()` (Telegram user ID) | Numeric string                         |
| `conversationId` | `string`    | `ctx.chat.id.toString()` (Telegram chat ID) | Numeric string                         |
| `messages`       | `Message[]` | VoltAgent memory system                     | Auto-managed by `agent.generateText()` |

**Relationships**: Each Conversation belongs to one Telegram user. Messages are ordered chronologically.

**State Transitions**: Created on first message → Active (messages appended on each interaction) → Persisted indefinitely in LibSQL.

---

### 3. SkillSearchResult

Ephemeral object returned by the `findSkills` tool. Not persisted.

| Field           | Type     | Source                         | Validation                                                          |
| --------------- | -------- | ------------------------------ | ------------------------------------------------------------------- |
| `id`            | `string` | skills.sh API `id` field       | Non-empty                                                           |
| `skillId`       | `string` | skills.sh API `skillId` field  | Non-empty                                                           |
| `name`          | `string` | skills.sh API `name` field     | Non-empty                                                           |
| `installs`      | `number` | skills.sh API `installs` field | Non-negative integer                                                |
| `source`        | `string` | skills.sh API `source` field   | Format: `owner/repo`                                                |
| `genAgentTrust` | `string` | Parsed from audit page         | `"Safe"`, `"Med Risk"`, `"Critical"`, or `"N/A"`                    |
| `socket`        | `string` | Parsed from audit page         | Number of alerts, or `"N/A"`                                        |
| `snyk`          | `string` | Parsed from audit page         | `"Low Risk"`, `"Med Risk"`, `"High Risk"`, `"Critical"`, or `"N/A"` |

**Relationships**: Returned as array from `findSkills` tool. Each result may be passed to `installSkill`.

---

### 4. InstalledSkill

A skill installed to the local `./skills/` directory.

| Field         | Type     | Source                           | Validation                 |
| ------------- | -------- | -------------------------------- | -------------------------- |
| `slug`        | `string` | `skillId` from API               | Non-empty, filesystem-safe |
| `name`        | `string` | Parsed from SKILL.md frontmatter | Non-empty                  |
| `description` | `string` | Parsed from SKILL.md frontmatter | Non-empty                  |
| `source`      | `string` | `source` from API (owner/repo)   | Non-empty                  |
| `version`     | `string` | `"1.0.0"` (initial install)      | Semver string              |
| `installedAt` | `string` | ISO 8601 timestamp               | Valid date string          |

**Relationships**: Stored as `./skills/{slug}/_meta.json` + `./skills/{slug}/SKILL.md`.

**State Transitions**: Not present → Installed (files written to disk) → Persisted across restarts.

**File structure per installed skill**:

```
skills/{slug}/
├── _meta.json    # { slug, name, description, source, version, installedAt }
└── SKILL.md      # Raw SKILL.md content from GitHub
```

---

## Zod Schemas

### Provider Configuration Types

```typescript
import { z } from "zod";

const SUPPORTED_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "azure",
  "groq",
  "mistral",
  "ollama",
] as const;

export const providerNameSchema = z.enum(SUPPORTED_PROVIDERS);
export type ProviderName = z.infer<typeof providerNameSchema>;
```

### findSkills Tool Schemas

```typescript
// Input
export const findSkillsInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("Search query for skills (e.g., 'react', 'code review')"),
});

// Output (returned as formatted string — the LLM presents it to the user)
// No formal output schema needed; tool returns a string.
```

### installSkill Tool Schemas

```typescript
// Input
export const installSkillInputSchema = z.object({
  skillId: z
    .string()
    .min(1)
    .describe("The skill ID to install (e.g., 'vercel-react-best-practices')"),
  source: z
    .string()
    .min(1)
    .describe("The source repository (e.g., 'vercel-labs/agent-skills')"),
  name: z.string().min(1).describe("The display name of the skill"),
});

// Output (returned as string confirmation message)
```

---

## Environment Variables

| Variable                       | Required    | Default                  | Description                                          |
| ------------------------------ | ----------- | ------------------------ | ---------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`           | **Yes**     | —                        | Telegram bot token from BotFather                    |
| `TELEGRAM_MODE`                | No          | `polling`                | `polling` or `webhook`                               |
| `TELEGRAM_WEBHOOK_URL`         | Conditional | —                        | Required if `TELEGRAM_MODE=webhook`                  |
| `MODEL_PROVIDER`               | No          | `openai`                 | LLM provider name                                    |
| `MODEL_ID`                     | No          | `gpt-4o-mini`            | Model identifier / deployment name                   |
| `OPENAI_API_KEY`               | Conditional | —                        | Required if `MODEL_PROVIDER=openai`                  |
| `ANTHROPIC_API_KEY`            | Conditional | —                        | Required if `MODEL_PROVIDER=anthropic`               |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Conditional | —                        | Required if `MODEL_PROVIDER=google`                  |
| `AZURE_API_KEY`                | Conditional | —                        | Required if `MODEL_PROVIDER=azure`                   |
| `AZURE_RESOURCE_NAME`          | Conditional | —                        | Required if `MODEL_PROVIDER=azure`                   |
| `GROQ_API_KEY`                 | Conditional | —                        | Required if `MODEL_PROVIDER=groq`                    |
| `MISTRAL_API_KEY`              | Conditional | —                        | Required if `MODEL_PROVIDER=mistral`                 |
| `OLLAMA_BASE_URL`              | No          | `http://localhost:11434` | Ollama server URL                                    |
| `ALLOWED_TELEGRAM_USER_IDS`    | No          | —                        | Comma-separated Telegram user IDs for access control |
| `VOLTAGENT_PUBLIC_KEY`         | No          | `""`                     | VoltOps telemetry public key                         |
| `VOLTAGENT_SECRET_KEY`         | No          | `""`                     | VoltOps telemetry secret key                         |
