# Data Model: Skill Discovery Execution

**Feature**: 008-skill-discovery-execution  
**Date**: 2026-05-21

---

## Entities

### InstalledSkill

A locally available skill discovered from a folder under `skills/`.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `slug` | string | Directory name used as the installed skill identifier |
| `name` | string | Human-readable skill name from metadata or markdown frontmatter |
| `description` | string | Short purpose statement derived from metadata or markdown |
| `source` | string \| null | Original source repository when known |
| `installedAt` | string \| null | Installation timestamp when available from metadata |
| `skillFilePath` | string | Path to the local `SKILL.md` file |
| `metaFilePath` | string \| null | Path to the local `_meta.json` file when present |
| `summary` | string | Condensed summary extracted for user-facing listing |
| `usageGuidance` | string \| null | Condensed guidance describing when the skill should be used |
| `status` | `available` \| `partial` \| `invalid` | Whether the skill can be fully used for inspection and guidance |
| `warnings` | string[] | Non-fatal issues encountered while reading or parsing the skill |

Notes:

- `status = available` means both identity and useful description could be derived.
- `status = partial` means the skill can still be surfaced, but some metadata or guidance is missing.
- `status = invalid` means the directory exists but no usable skill definition could be read.

---

### SkillCatalog

An in-memory collection assembled for a single tool execution.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `skills` | InstalledSkill[] | All discovered local skills |
| `availableCount` | number | Count of skills with usable summaries |
| `invalidCount` | number | Count of skills that could not be fully parsed |
| `scannedAt` | string | Timestamp of the scan |

The catalog is computed on demand from the filesystem and is not persisted separately.

---

### SkillLookupRequest

A normalized lookup input used by the installed-skill inspection tool.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `query` | string | User-provided skill name or identifier |
| `normalizedQuery` | string | Lowercased, punctuation-normalized comparison value |

Matching rules:

- Exact slug match wins first
- Exact normalized name match wins second
- Contains-match on normalized slug or name can be used as a fallback when a single clear match exists

---

## Derived Views

### Skill List View

Used by `listInstalledSkills` to present installed capabilities.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `displayName` | string | Name shown to the user |
| `shortSummary` | string | One-line explanation of purpose |
| `availabilityNote` | string \| null | Optional warning for partial or invalid skills |

---

### Skill Detail View

Used by `readInstalledSkill` to explain a specific installed skill.

| Field | Type | Description |
| ----- | ---- | ----------- |
| `displayName` | string | Skill name presented to the user |
| `purpose` | string | What the skill is for |
| `recommendedUseCases` | string[] | Situations where the skill is relevant |
| `limitations` | string[] | Constraints or warnings derived from available content |
| `availabilityStatus` | string | Human-readable interpretation of `status` |

---

## TypeScript Shapes

```ts
import { z } from "zod";

export const InstalledSkillStatusSchema = z.enum([
  "available",
  "partial",
  "invalid",
]);

export const InstalledSkillSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  source: z.string().nullable(),
  installedAt: z.string().nullable(),
  skillFilePath: z.string(),
  metaFilePath: z.string().nullable(),
  summary: z.string().default(""),
  usageGuidance: z.string().nullable(),
  status: InstalledSkillStatusSchema,
  warnings: z.array(z.string()),
});

export const ListInstalledSkillsInputSchema = z.object({
  includeWarnings: z.boolean().default(false),
});

export const ReadInstalledSkillInputSchema = z.object({
  query: z.string().min(1),
});
```

---

## Failure Handling

- Missing `SKILL.md`: create an `InstalledSkill` record with `status = invalid` if the folder exists but no usable skill definition is present.
- Missing `_meta.json`: continue using markdown-derived values and mark the skill `partial` only if important summary fields cannot be derived.
- Invalid JSON in `_meta.json`: ignore metadata, add a warning, and continue from markdown.
- Empty or extremely short markdown: mark as `partial` or `invalid` depending on whether a useful name and purpose can still be derived.

---

## State And Persistence

No new database tables are required. Installed skill state remains file-based:

- `skills/<slug>/SKILL.md`
- `skills/<slug>/_meta.json`

All catalog and lookup structures are computed per request and discarded after tool execution.