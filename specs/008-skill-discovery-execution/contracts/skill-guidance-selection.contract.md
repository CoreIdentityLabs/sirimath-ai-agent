# Contract: Skill Guidance Selection

## Purpose

Define how Sirimath should use installed skill guidance while answering user requests.

## Behavioral Contract

1. When the user asks what skills are already available, Sirimath must use the installed-skill listing capability rather than guessing.
2. When the user asks about a specific installed skill, Sirimath must inspect the installed skill before summarizing it.
3. When the user asks for help with a task that appears related to an installed skill, Sirimath should inspect relevant installed skill guidance before answering if doing so is likely to improve the response.
4. When no installed skill is relevant, Sirimath must continue with normal assistant behavior instead of refusing the request.
5. When a local skill is missing, incomplete, or invalid, Sirimath must explain that clearly and, when helpful, suggest finding or installing another skill.

## Non-Goals

- Executing arbitrary code contained in skill files
- Guaranteeing that every task with a loosely related skill uses that skill
- Replacing Sirimath's general reasoning with skill content alone

## Acceptance Signals

- Users can explicitly discover installed capabilities
- Users can inspect a named installed skill
- Responses to matching tasks reflect installed skill guidance more often than baseline behavior
- Capability gaps still result in a helpful next step