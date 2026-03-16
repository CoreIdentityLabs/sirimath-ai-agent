# Contract: Skill Tools

**Module**: `src/tools/find-skills.ts` + `src/tools/install-skill.ts`  
**Type**: VoltAgent Tools (via `createTool`)  
**Date**: 2026-03-16

---

## Tool 1: findSkills

### Purpose

Searches the skills.sh API for agent skills matching a natural language query. Returns a formatted table with skill metadata and security audit scores.

### Schema

```typescript
import { createTool } from "@voltagent/core";
import { z } from "zod";

export const findSkillsTool = createTool({
  name: "findSkills",
  description:
    "Search for agent skills on skills.sh. Use when the user asks to find, discover, or search for skills, or says 'how do I do X' where X might be an existing skill. Returns a formatted list with security audit scores.",
  parameters: z.object({
    query: z
      .string()
      .min(1)
      .describe("Search term (e.g., 'react', 'code review', 'web scraping')"),
  }),
  execute: async ({ query }) => {
    // 1. GET https://skills.sh/api/search?q={query}
    // 2. GET https://skills.sh/audits (fetch audit markdown)
    // 3. Cross-reference skills with audit scores
    // 4. Return formatted table string
  },
});
```

### External API Calls

| Endpoint                                 | Method | Purpose                       |
| ---------------------------------------- | ------ | ----------------------------- |
| `https://skills.sh/api/search?q={query}` | GET    | Search for skills             |
| `https://skills.sh/audits`               | GET    | Fetch security audit markdown |

### Response Format

Returns a string formatted as a numbered table:

```
#  Skill                         Publisher      Installs   Gen    Socket  Snyk
─  ─────────────────────────────  ─────────────  ────────   ─────  ──────  ────────
1  vercel-react-best-practices   vercel-labs     175.3K    ✅Safe  ✅ 0    ✅Low
2  web-design-guidelines         vercel-labs     135.8K    ✅Safe  ✅ 0    ⚠️Med

🔗 Browse all: https://skills.sh/
Pick a number to install (or "none")
```

### Error Handling

- API unreachable → return "Skill search is temporarily unavailable. Please try again later."
- No results → return "No matching skills found for '{query}'."
- Audit fetch fails → show results with "⚠️ Audit unavailable" for security columns

---

## Tool 2: installSkill

### Purpose

Installs a skill from the skills.sh ecosystem to the local `./skills/` directory. Fetches the SKILL.md from GitHub, validates content, and persists locally.

### Schema

```typescript
export const installSkillTool = createTool({
  name: "installSkill",
  description:
    "Install a skill from skills.sh. Only use after findSkills has returned results and the user has confirmed which skill to install. Fetches the skill definition from GitHub and saves it locally.",
  parameters: z.object({
    skillId: z
      .string()
      .min(1)
      .describe("Skill directory name (e.g., 'vercel-react-best-practices')"),
    source: z
      .string()
      .min(1)
      .describe("GitHub repo path (e.g., 'vercel-labs/agent-skills')"),
    name: z.string().min(1).describe("Display name for the skill"),
  }),
  execute: async ({ skillId, source, name }) => {
    // 1. Fetch SKILL.md from GitHub (try main, then master)
    // 2. Validate content (non-empty, not HTML error)
    // 3. Parse frontmatter for name/description
    // 4. Write to ./skills/{skillId}/SKILL.md
    // 5. Write ./skills/{skillId}/_meta.json
    // 6. Return success message
  },
});
```

### External API Calls

| Endpoint                                                               | Method | Purpose                          |
| ---------------------------------------------------------------------- | ------ | -------------------------------- |
| `https://raw.githubusercontent.com/{source}/main/{skillId}/SKILL.md`   | GET    | Fetch skill definition (primary) |
| `https://raw.githubusercontent.com/{source}/master/{skillId}/SKILL.md` | GET    | Fallback if `main` branch fails  |

### File System Operations

| Path                            | Operation | Content                                                     |
| ------------------------------- | --------- | ----------------------------------------------------------- |
| `./skills/{skillId}/SKILL.md`   | Write     | Raw fetched SKILL.md content                                |
| `./skills/{skillId}/_meta.json` | Write     | `{ slug, name, description, source, version, installedAt }` |

### Response Format

Success:

```
✅ Installed "{name}" skill successfully.
Location: ./skills/{skillId}/
```

Failure:

```
❌ Could not install "{name}": {reason}
```

### Validation Rules

1. Fetched content must not be empty
2. Content must not be an HTML error page (check for `<!DOCTYPE` or `<html`)
3. Content should be longer than 50 characters (meaningful instructions)
4. Content should contain at least one heading (`#`) to validate it's markdown
