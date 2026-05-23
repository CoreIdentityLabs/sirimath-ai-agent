# Implementation Plan: Skill Discovery Execution

**Branch**: `[008-skill-discovery-execution]` | **Date**: 2026-05-21 | **Spec**: [spec.md](../008-skill-discovery-execution/spec.md)
**Input**: Feature specification from `/specs/008-skill-discovery-execution/spec.md`

## Summary

Add a local skill discovery and skill-aware response path so Sirimath can surface already installed skills, explain what each installed skill does, and use installed skill guidance when a user request matches a local skill. The implementation should build on the existing `skills/` directory and current skill installation flow, add focused tools for listing and inspecting installed skills, and extend the base agent instructions so skill guidance is considered during normal task handling without replacing the general assistant behavior.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 22+  
**Primary Dependencies**: `@voltagent/core`, `zod`, `grammy`, `@voltagent/logger`, existing built-in Node.js filesystem APIs  
**Storage**: Local filesystem under `skills/` for installed skill definitions and metadata; no new database required  
**Testing**: `npm run typecheck`, `npm run lint`; manual conversational validation because no dedicated automated test suite is configured  
**Target Platform**: Node.js Telegram-based assistant service running on local development and containerized deployments  
**Project Type**: Single TypeScript agent service  
**Performance Goals**: Installed-skill listing and lookup should complete within a single agent step and remain fast enough that users receive responses without noticeable added delay for typical local skill counts  
**Constraints**: Keep new logic consistent with VoltAgent tool patterns, avoid hardcoded model/provider behavior, preserve current internet skill discovery and installation behavior, and keep channel-specific code out of the skill discovery implementation  
**Scale/Scope**: Dozens of locally installed skills in the `skills/` directory, with per-request skill matching limited to the assistant's normal conversational flow

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Verify each gate applies to this feature and document the outcome:

| Gate                                                                   | Principle                      | Outcome                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Agent-First: feature exposed via a VoltAgent agent                     | I. Agent-First Design          | ✅ Capability is exposed through the existing Sirimath agent and new agent tools.                        |
| All new code in TypeScript strict; Zod schemas for tool/workflow I/O   | II. Type Safety                | ✅ New tool inputs and parsed skill shapes can remain schema-backed and strict.                          |
| New capabilities as `createTool` with typed input/output               | III. Tool-Driven Extensibility | ✅ Listing and inspecting installed skills fit naturally as typed `createTool` capabilities.             |
| Observability adapter configured; structured logging only              | IV. Observability-First        | ✅ Existing logging and observability setup remain sufficient; no ad hoc output channel is required.     |
| No speculative abstractions; complexity justified                      | V. Simplicity & YAGNI          | ✅ Feature can be implemented with focused filesystem readers plus agent instruction updates only.       |
| Model via env vars; no hardcoded provider; Azure AI Foundry supported  | VI. Multi-Provider / BYOK      | ✅ Model resolution flow is unchanged because the feature is provider-agnostic.                          |
| Channel code in `src/channels/`; agent logic channel-agnostic          | VII. Channel Abstraction       | ✅ Skill discovery and skill-aware task handling stay in tools and agent logic, not channel adapters.    |
| Tech stack additions within allowed set (see Technology Stack section) | Technology Stack               | ✅ No new framework or platform additions are required.                                                  |

Post-design re-check: still ✅. The feature stays inside the current agent-and-tools architecture and does not require exceptions.

## Project Structure

### Documentation (this feature)

```text
specs/008-skill-discovery-execution/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── installed-skills.contract.md
│   └── skill-guidance-selection.contract.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── agent-tools.ts
│   └── base-agent.ts
├── tools/
│   ├── find-skills.ts
│   ├── install-skill.ts
│   ├── index.ts
│   ├── list-installed-skills.ts
│   ├── read-installed-skill.ts
│   └── shared/
│       └── installed-skills.ts
└── index.ts

skills/
└── <skill-slug>/
    ├── SKILL.md
    └── _meta.json
```

**Structure Decision**: Keep the current single-service layout. Put reusable filesystem parsing helpers under `src/tools/shared/`, expose user-facing capabilities as new tools under `src/tools/`, and update the existing agent assembly points in `src/agents/` so installed skill awareness becomes part of the normal conversational path.

## Phase 0: Research Summary

Primary decisions are captured in [research.md](../008-skill-discovery-execution/research.md). The key resolved unknowns are:

1. Represent installed-skill discovery as local tools backed by the `skills/` directory rather than by scanning prompt attachments or teaching the agent to inspect the filesystem implicitly.
2. Reuse the existing tool-driven Sirimath architecture by adding explicit installed-skill listing and inspection tools instead of embedding this logic only in the base-agent prompt.
3. Treat skill-guided task handling as an instruction and tool-selection improvement layered onto the current agent flow rather than a separate execution engine.

## Phase 1: Design

### Data Model

See [data-model.md](../008-skill-discovery-execution/data-model.md).

### Contracts

See [installed-skills.contract.md](../008-skill-discovery-execution/contracts/installed-skills.contract.md) and [skill-guidance-selection.contract.md](../008-skill-discovery-execution/contracts/skill-guidance-selection.contract.md).

### Quickstart

See [quickstart.md](../008-skill-discovery-execution/quickstart.md).

## Implementation Approach

### 1. Add a shared installed-skill reader for local skill folders

Current skill support is split between `find-skills.ts` for remote discovery and `install-skill.ts` for downloading `SKILL.md` files into the local `skills/` directory. There is no shared reader for installed skills. Introduce a focused helper module that:

- Enumerates directories under `skills/`
- Reads `_meta.json` when present
- Reads `SKILL.md` when present
- Parses lightweight frontmatter and extracts a short summary from the markdown body
- Returns a normalized installed-skill shape plus recoverable error flags when files are missing or malformed

Reasoning: this keeps filesystem parsing out of the agent prompt and avoids duplicating parsing logic across multiple tools.

### 2. Add explicit tools for listing and inspecting installed skills

Expose two new capabilities through `createTool`:

- `listInstalledSkills`: returns a human-readable list of installed skills and concise summaries
- `readInstalledSkill`: returns details for a named skill, including purpose, likely use cases, and any available description metadata

Expected behavior:

- If no installed skills are found, respond with a clear empty-state message
- If a requested skill is not found, return a non-fatal, user-friendly result
- If some skills are malformed, omit or flag them without failing the entire response

Reasoning: FR-001 through FR-005 are direct tool-shaped capabilities and should not depend solely on the model inferring local files.

### 3. Extend agent instructions to use installed skills during task handling

The base agent already knows how to discover and install remote skills, but it does not know how to inspect local skills or prefer them during relevant requests. Update the agent instructions so that:

- When users ask what capabilities are already installed, the agent calls `listInstalledSkills`
- When users ask about a specific installed skill, the agent calls `readInstalledSkill`
- When a user asks for help on a task that may map to an installed skill, the agent should inspect relevant installed skills before answering when doing so would improve the response
- If no installed skill applies, the agent should continue with the normal assistant behavior and optionally point users to remote skill discovery when there is a capability gap

Reasoning: this satisfies FR-006 through FR-010 while preserving the current conversational experience.

### 4. Keep skill matching lightweight and instruction-led

This feature does not require a new ranking engine or embedding pipeline. A minimal first version can rely on:

- Exact and normalized name matching for explicit skill lookup
- Agent-directed inspection of one or more candidate installed skills during task handling
- Short, structured tool outputs that make it easier for the model to choose the most relevant skill

Reasoning: the spec requires useful relevance handling, not a full retrieval system. More advanced ranking can be added later if the simple approach proves insufficient.

### 5. Preserve current remote skill discovery and installation behavior

The new local-skill capability complements, rather than replaces, the existing tools. The implementation should leave `findSkills` and `installSkill` intact while making the agent able to bridge between them:

- If installed skills are insufficient, suggest `findSkills`
- If a named skill is missing locally, indicate that it is not installed and offer discovery/install guidance

Reasoning: the feature is about filling gaps in current capability visibility, not changing how remote skill acquisition works.

## Implementation Order

1. Add shared installed-skill parsing and normalization helpers.
2. Add installed-skill listing and inspection tools plus exports from the tool index.
3. Update shared agent tool assembly so the new tools are available to Sirimath.
4. Update base-agent instructions to cover installed-skill listing, inspection, and skill-aware task routing.
5. Validate behavior with typecheck, lint, and manual conversational checks using existing sample skills.

## Risks And Mitigations

- Malformed local skill files may produce brittle summaries.
  Mitigation: parse defensively, surface partial results, and never fail the full tool response because one skill is bad.
- The model may over-apply loosely related skills.
  Mitigation: keep tool outputs concise and update instructions to prefer clearly relevant skills only.
- Large `SKILL.md` files may produce noisy tool output.
  Mitigation: return trimmed summaries and targeted excerpts instead of full raw markdown by default.

## Out Of Scope

- Executing arbitrary code or tool implementations defined inside downloaded skill markdown
- Adding a separate persistence layer for installed skill indexing
- Building semantic retrieval or embeddings specifically for skills
- Editing installed skill files through chat