# Research: Skill Discovery Execution

## Decision 1: Use explicit local installed-skill tools backed by the `skills/` directory

Decision: Add dedicated tools that read installed skills from the repository's local `skills/` directory.

Rationale: Installed skills already exist as local artifacts containing `SKILL.md` and `_meta.json`. Turning that filesystem state into explicit tools makes the capability available to the agent in a controlled, testable way and matches the existing VoltAgent tool pattern used elsewhere in the project.

Alternatives considered:

- Rely on the model to infer installed skills from repository context. Rejected because runtime agent behavior should not depend on editor context or prompt attachments.
- Reuse the remote search API for installed skill discovery. Rejected because the requirement is about what is already available locally, not what exists on the internet.

## Decision 2: Reuse the current agent tool surface instead of introducing a new skill runtime

Decision: Keep installed-skill support within the current Sirimath agent and tool assembly rather than introducing a separate skill execution subsystem.

Rationale: The feature needs discovery, explanation, and guidance-aware responses. Those are naturally expressed as additional tools and instruction updates. A separate runtime would add complexity without satisfying any requirement that the current architecture cannot already cover.

Alternatives considered:

- Build a dedicated skill orchestration service. Rejected because it is disproportionate to the current scope and would create new lifecycle and integration concerns.
- Inject raw `SKILL.md` content directly into the base prompt at startup. Rejected because that would make prompt size scale with installed skills and reduce control over what the model sees per request.

## Decision 3: Use lightweight parsing and summary extraction for installed skills

Decision: Parse available metadata and small markdown excerpts instead of returning entire `SKILL.md` files by default.

Rationale: Users need understandable summaries and targeted explanations, not raw file dumps. Short structured outputs are easier for the model to use consistently when deciding whether a skill is relevant to a request.

Alternatives considered:

- Return the full skill markdown from tools. Rejected because it can be noisy, token-heavy, and less reliable for response quality.
- Depend only on `_meta.json`. Rejected because some useful usage guidance may exist only in `SKILL.md`.

## Decision 4: Keep skill matching instruction-led for the first iteration

Decision: Let the agent decide when to inspect installed skills using concise tool outputs rather than adding a scoring or embedding system.

Rationale: The current scale is small and the spec does not require advanced retrieval infrastructure. Instruction-led matching is sufficient for explicit skill listing, named lookups, and many task-driven cases where the user intent is clear.

Alternatives considered:

- Add embeddings for installed skill retrieval. Rejected because it introduces extra indexing, storage, and ranking complexity not justified by the feature scope.
- Hardcode keyword rules per skill. Rejected because downloaded skills are user-extensible and should not require manual code updates for every new skill.

## Decision 5: Treat malformed or incomplete skills as partial failures, not fatal errors

Decision: Installed-skill tools should continue returning useful results even when one or more skill folders are incomplete or invalid.

Rationale: The spec explicitly requires resilience when skill definitions are missing or unreadable. A single bad skill should not block visibility into all other installed skills.

Alternatives considered:

- Fail the entire request if any installed skill is invalid. Rejected because it makes the feature fragile and violates the user-facing resilience requirement.
- Ignore invalid skills silently. Rejected because users need some indication when a local installation is present but unusable.