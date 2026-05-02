# Feature Specification: Background Agent Outbound Execution

**Feature Branch**: `[007-background-agent-outbound-execution]`  
**Created**: 2026-05-02  
**Status**: Draft  
**Input**: User description: "As a user I need a new background agent that: 1. Fires on the heartbeat interval 2. Autonomously calls tools (fetch any tools sirimath has) 3. Formats the result 4. Pushes it into users chat as an outbound message

Current reminder feature is a strictly reactive execution loop. It only wake up and run tools when user send a message. The reminder/heartbeat system lives outside of agent and — it’s a scheduler that drops a note into users chat, but it doesn’t loop back to wake sirimath up, run any tools or tasks it assign to and push the results. Right now, that last mile — pushing an outbound message with freshly fetched data without a user prompt — is outside its reach. The heartbeat system can notify, but it can’t act on behalf of sirimath. This new feature will address this architectural limitation sirimath has."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Deliver Proactive Outbound Updates (Priority: P1)

As a user who has enabled heartbeat-driven reminders or proactive tasks, I receive a freshly generated outbound chat message at the scheduled heartbeat time without needing to send a prompt first.

**Why this priority**: This is the core product gap. Without autonomous outbound execution, heartbeat scheduling can notify but cannot complete the promised task.

**Independent Test**: Can be fully tested by configuring a heartbeat-driven task, waiting for the next heartbeat interval, and confirming that the system fetches current information and sends a completed outbound message into the user chat without any inbound message.

**Acceptance Scenarios**:

1. **Given** a user has an active heartbeat-driven proactive task, **When** the next heartbeat interval arrives, **Then** the system wakes the background agent, executes the assigned task, and posts the resulting outbound message into that user's chat.
2. **Given** a proactive task requires current external information, **When** the heartbeat interval arrives, **Then** the outbound message includes newly fetched results rather than a stale reminder placeholder.

---

### User Story 2 - Execute Tasks With Available Tools (Priority: P2)

As a user, I want the background agent to use the same Sirimath tools available during normal conversations so that proactive messages can include useful, task-specific results.

**Why this priority**: The feature only closes the architectural gap if the background agent can act, not merely emit static text.

**Independent Test**: Can be fully tested by assigning a proactive task that requires one or more existing tools and verifying that the outbound message contains the tool-derived result.

**Acceptance Scenarios**:

1. **Given** a proactive task references information obtainable through an existing Sirimath tool, **When** the background agent runs, **Then** it may invoke the relevant available tools needed to complete that task.
2. **Given** multiple tools are available, **When** the background agent determines that only a subset is needed, **Then** it uses only the tools required to fulfill the task.

---

### User Story 3 - Receive Safe, Readable Failures And Retries (Priority: P3)

As a user, I want proactive outbound execution failures to be handled gracefully so that I receive either a useful fallback message or no misleading message at all.

**Why this priority**: Autonomous execution introduces failure modes that would otherwise silently degrade trust or spam users with partial output.

**Independent Test**: Can be fully tested by forcing tool or delivery failures and verifying that the system does not send malformed content, duplicate messages, or misleading stale output.

**Acceptance Scenarios**:

1. **Given** a required tool call fails during background execution, **When** the run cannot produce a valid result, **Then** the system records the failure and avoids sending a misleading outbound message.
2. **Given** outbound delivery fails after task execution completes, **When** the system handles the failure, **Then** it preserves enough execution state to prevent accidental duplicate deliveries on the next recovery path.

### Edge Cases

- What happens when overlapping background runs for the same user produce competing outbound messages or duplicate tool side effects?
- How does the system handle a tool that requires conversational context or permissions that are unavailable in a background execution context?
- What happens when a user disables reminders or revokes access after a background task was scheduled but before the next heartbeat fires?
- How does the system behave when the generated outbound result exceeds the chat channel's message size limits?
- How does the system prevent duplicate outbound messages if the scheduler retries after a timeout or partial delivery failure?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST support a background execution path that is triggered by the heartbeat interval without requiring an inbound user message.
- **FR-002**: System MUST determine which users and proactive tasks are due at a heartbeat interval and start an isolated background run for each due execution.
- **FR-003**: System MUST allow the background run to invoke the same Sirimath tool capabilities that are permitted for normal user-facing agent execution, subject to the same access controls and safety constraints.
- **FR-004**: System MUST default background runs to the same interactive tool availability as the user session. Stricter per-task or per-channel tool restrictions are out of scope for this feature and MUST NOT be partially implemented.
- **FR-005**: System MUST provide the background run with the user identity, relevant conversation context, and task instructions required to act on behalf of that user.
- **FR-006**: System MUST generate a user-facing outbound message from the background run result before delivery to the chat channel.
- **FR-007**: System MUST deliver the generated outbound message into the target user's chat without waiting for a new inbound prompt.
- **FR-008**: System MUST mark each heartbeat-triggered execution with a distinct lifecycle state so the system can track scheduled, running, completed, failed, delivery-failed, and cancelled executions.
- **FR-009**: System MUST prevent duplicate outbound messages for the same scheduled execution even if the heartbeat scheduler retries or restarts.
- **FR-010**: System MUST skip or cancel background execution when the target user, task, or delivery channel is no longer eligible at execution time.
- **FR-011**: System MUST record execution outcomes, including tool usage, delivery result, and failure reason, so operators can diagnose background runs.
- **FR-012**: System MUST enforce bounded execution for heartbeat-triggered runs so a single background task cannot monopolize the scheduler indefinitely.
- **FR-013**: System MUST preserve existing reactive reminder behavior for tasks that are configured only to notify rather than autonomously act.
- **FR-014**: Users MUST be able to receive outbound background messages in a format that clearly distinguishes actionable results from ordinary reminder text.
- **FR-015**: System MUST handle outbound messages that exceed channel limits by splitting them into user-comprehensible channel-sized chunks.
- **FR-016**: System MUST allow overlapping background runs for the same user when multiple heartbeat-triggered executions are due in parallel.
- **FR-017**: System MUST isolate overlapping runs so that execution state, tool activity records, and outbound delivery tracking remain attributable to the correct scheduled execution.

Eligibility outcome mapping for FR-010:

- `cancelled`: the run is intentionally skipped before generation because the reminder is inactive, disabled, or no longer eligible to execute.
- `failed`: the run started or attempted required execution setup, but could not proceed because of a runtime problem such as missing adapter, invalid conversation identifier, timeout, or delivery error.

Overlapping side-effect policy for FR-016/FR-017:

- This feature guarantees execution-state isolation and outbound-delivery deduplication only.
- It does not add extra side-effect suppression for non-idempotent tools used by overlapping runs.
- Tool implementations remain responsible for any stronger idempotency guarantees they require.

### Key Entities _(include if feature involves data)_

- **Background Execution**: A scheduled autonomous run associated with one user, one due heartbeat event, one task instruction set, a lifecycle state, timestamps, delivery status, and execution outcome.
- **Proactive Task**: A user-configured instruction that can be evaluated on heartbeat intervals and may either notify only or run autonomously to produce an outbound result.
- **Execution Context**: The scoped user identity, memory, permissions, task instructions, and relevant conversation state available to a background run.
- **Outbound Message Record**: The user-visible message payload produced by a background execution, including formatted content, destination chat, delivery attempts, and deduplication identifier.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 95% of eligible heartbeat-triggered proactive tasks result in either a successfully delivered outbound message or a recorded non-delivery outcome within 2 heartbeat cycles.
- **SC-002**: 90% of successful proactive outbound executions deliver a user-readable result within 60 seconds of the scheduled heartbeat trigger.
- **SC-003**: Duplicate outbound deliveries for the same scheduled execution occur in fewer than 1% of executions during normal operation.
- **SC-004**: At least 90% of proactive outbound messages contain task-specific content produced from current execution-time data rather than static reminder boilerplate.
- **SC-005**: Support and debugging workflows can identify the execution status and failure reason for 100% of failed proactive runs.

## Assumptions

- Heartbeat scheduling already exists and remains the trigger source for due proactive work.
- Existing Sirimath tools remain the tool surface for proactive execution; this feature is about enabling autonomous invocation, not defining new tools.
- Background runs default to the same tool availability the user has interactively, unless a stricter policy is configured elsewhere.
- Multiple due heartbeat executions for the same user may run in parallel by default, and the system is expected to manage resulting overlap safely.
- Users opt into proactive tasks through existing or adjacent reminder configuration flows rather than through a separate standalone scheduling product.
- Outbound delivery uses the same chat destination already associated with the user's conversation channel.
- The system may continue to support reminder-only tasks alongside autonomous task execution.
- Autonomous tasks respect the same quiet-hours suppression as reminder-only tasks; digest aggregation remains a reminder-only behavior in this feature.
- Autonomous tasks in this feature require an explicit execution prompt and do not fall back to the reminder description.
- Relevant conversation context is provided implicitly through the existing memory and conversation identifiers already passed to the agent invocation; no extra transcript assembly is required in this feature.
- If a background execution becomes stale after process interruption, startup recovery marks it failed with a recovery reason rather than retrying generation automatically.
- If delivery fails after generation, the same execution record may be retried by the scheduler recovery path until delivery succeeds or the run is marked terminal, but duplicate user-visible sends for the same dedupe key remain forbidden.
- SC-001 is measured from `scheduledFor` to the first terminal execution state timestamp (`completed`, `failed`, `delivery-failed`, or `cancelled`) and compared against two heartbeat intervals.
- SC-002 is measured from `scheduledFor` to the successful delivery timestamp recorded for a `completed` execution.
- FR-014 is satisfied in this feature by requiring autonomous outbound messages to begin with the fixed prefix `Proactive update:`.
