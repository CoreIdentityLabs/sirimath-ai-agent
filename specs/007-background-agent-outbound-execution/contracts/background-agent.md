# Contract: Background Agent Execution

## Purpose

Define the invocation contract for heartbeat-triggered autonomous agent runs.

## Input contract

The background runner invokes a memory-aware agent using the same envelope shape currently used by Telegram inbound handling:

```ts
type BackgroundAgentInvocation = {
  input: string;
  channel: string;
  channelUserId: string;
  conversationId: string;
};
```

## Prompt construction requirements

The `input` string must include:

1. A statement that the run was triggered automatically on heartbeat.
2. The proactive task instruction from `executionPrompt`.
3. A statement that the user is absent and no clarifying question is allowed.
4. A requirement to use tools if current data is needed.
5. A requirement to return only the final outbound-ready message.
6. A requirement to format the user-visible result distinctly from reminder nudges by beginning with the fixed prefix `Proactive update:`.

Example:

```text
Background heartbeat task.
User is not present, so do not ask questions.
Task: Fetch today's weather for Colombo and send a concise update.
Use available tools when needed to get current data.
Return only the message to send to the user, beginning with "Proactive update:".
```

## Output contract

The agent output is treated as final user-visible text:

```ts
type BackgroundAgentResult = {
  text: string;
};
```

Requirements:

1. `text` must not be empty.
2. `text` must not contain internal planning or chain-of-thought language.
3. `text` must begin with the fixed autonomous-result marker `Proactive update:`.
4. `text` should be concise enough for channel delivery, but channel adapters remain responsible for chunking.

## Failure contract

If the runner cannot obtain a valid result, it must not fabricate a user-visible placeholder. It records `failed`, `delivery-failed`, or `cancelled` in `background_executions` and logs the structured failure reason.

Relevant conversation context is supplied implicitly through the existing user and conversation identifiers passed into the agent invocation and resolved by the memory subsystem; no additional transcript payload is required in this contract.
