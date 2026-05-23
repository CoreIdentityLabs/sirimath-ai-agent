# Quickstart: Skill Discovery Execution

**Feature**: 008-skill-discovery-execution  
**Audience**: Developer implementing this feature

---

## Prerequisites

- Feature branch `008-skill-discovery-execution` checked out
- `.env` configured enough to run the assistant locally
- `npm install` completed
- At least one sample skill folder present under `skills/`

---

## New Source Files

```text
src/tools/
├── list-installed-skills.ts
├── read-installed-skill.ts
└── shared/
    └── installed-skills.ts
```

Likely updated files:

```text
src/agents/
├── agent-tools.ts
└── base-agent.ts

src/tools/
└── index.ts
```

---

## Implementation Walkthrough

### 1. Build the installed-skill reader

Create a shared helper that scans `skills/`, reads `_meta.json` and `SKILL.md`, and returns normalized installed skill records with warnings instead of throwing on every parsing problem.

Key responsibilities:

- Enumerate skill directories
- Parse metadata when present
- Extract a readable summary from markdown frontmatter and leading sections
- Normalize skill names for lookup
- Surface partial or invalid skills without breaking the full scan
- Return a useful fallback result when the `skills/` directory is missing or unreadable

### 2. Add installed-skill tools

Create `listInstalledSkills` for capability discovery and `readInstalledSkill` for detailed inspection.

Expected results:

- Friendly empty-state if no skills are installed
- Compact summaries for lists
- Detailed purpose and usage guidance for a named skill
- Graceful error messaging for missing or malformed skills
- Clear user guidance when no installed skill covers the request, including how to extend capability with remote discovery/install flows

### 3. Register the tools with Sirimath

Update the shared tool assembly so the new tools are available alongside existing built-in tools and remote skill discovery/install tools.

### 4. Update base-agent instructions

Teach the agent when to:

- List installed skills
- Inspect a specific installed skill
- Use installed skill guidance before answering a relevant task request
- Prefer the most relevant installed skill when multiple installed skills could apply
- Fall back to normal assistant behavior or remote skill discovery when no local skill applies

---

## Manual Validation

### Static checks

Run:

```bash
npm run typecheck
npm run lint
```

### Conversational checks

Run the app locally:

```bash
npm run dev
```

Then validate these prompts against a bot session or dry-run path:

1. "What skills do you already have installed?"
2. "Explain the weather skill."
3. "Do you have any skill for browser automation?"
4. "Help me with a task covered by one installed skill and verify the answer reflects that skill's guidance."
5. "Explain a skill that is not installed."
6. "I need help with a task that could match two installed skills; verify the response prefers the more relevant skill and does not list unrelated skills as the answer."
7. "I need something you do not have a local skill for; verify the response still helps and points me to discover or install another skill."
8. Temporarily rename or deny access to the `skills/` directory and ask: "What skills do you already have installed?"

Expected outcomes:

- Installed skills are listed with understandable summaries
- A named installed skill can be explained without exposing raw file contents unless needed
- Missing skills are reported clearly
- Explicit skill-detail questions are answered from installed-skill inspection rather than guesswork
- Relevant tasks use installed skill guidance when appropriate
- When two installed skills could apply, the response prefers the more relevant skill guidance
- Non-matching tasks still get normal Sirimath behavior plus a clear next step such as remote skill discovery
- Missing or unreadable `skills/` directory access still returns a useful, user-safe message

### Lightweight evaluation rubric

Use this rubric for SC-002, SC-003, and SC-004 during manual validation:

- **Evaluation set**: Use all installed sample skills already present in `skills/`, plus the prompt set above.
- **SC-002 summary clarity**: Mark a result as passing if a non-technical reader can identify what the skill is for from the first response without reading raw markdown.
- **SC-003 relevant guidance selection**: Mark a result as passing if the response clearly reflects the best matching installed skill's purpose or usage guidance for the task.
- **SC-004 capability-gap next step**: Mark a result as passing if the response includes a concrete next step such as finding or installing a new skill.
- **Target**: At least 90% of reviewed skill summaries and matching-task responses should pass, and all no-skill prompts should include a clear next step.

---

## Rollback Strategy

If the feature causes poor response quality, rollback is limited to:

- Removing the new installed-skill tools from shared registration
- Reverting the base-agent instruction changes
- Leaving existing remote skill discovery and installation behavior untouched