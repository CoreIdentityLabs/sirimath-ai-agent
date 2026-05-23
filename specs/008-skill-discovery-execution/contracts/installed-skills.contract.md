# Contract: Installed Skills Tools

## Purpose

Define the user-facing contract for listing and inspecting installed local skills.

## Tool: `listInstalledSkills`

### Input

```ts
{
  includeWarnings?: boolean;
}
```

### Output requirements

- Returns a human-readable list of locally installed skills
- Includes each skill's display name and a concise purpose summary
- Returns a clear empty-state message when no installed skills are available
- Optionally includes warnings for partial or invalid installed skills when requested

### Error behavior

- Must not fail the whole response because one skill folder is malformed
- Must return a useful message if the `skills/` directory is missing or unreadable

## Tool: `readInstalledSkill`

### Input

```ts
{
  query: string;
}
```

### Output requirements

- Resolves a locally installed skill by slug or human-readable name when possible
- Returns a readable summary of the skill's purpose and likely use cases
- Indicates when the requested skill is not installed
- Flags incomplete or invalid local installations without crashing

### Matching rules

- Exact slug match takes precedence
- Exact normalized name match is second
- Single clear partial match may be used as fallback
- Ambiguous matches should ask the agent to clarify by naming candidate skills in the response text