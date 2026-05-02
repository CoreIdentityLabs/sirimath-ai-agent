# Quickstart: Background Agent Outbound Execution

## Goal

Validate that a heartbeat-triggered autonomous reminder can run tools and push a fresh outbound Telegram message without any inbound prompt.

## Prerequisites

1. A working `.env` with `TELEGRAM_BOT_TOKEN`, model provider settings, and any tool-specific API keys.
2. Telegram bot polling or webhook mode already functional.
3. A development database state where reminders can be inserted and heartbeat can run every minute.

## Run

1. Start the app with `npm run dev`.
2. Create an autonomous reminder entry using the extended reminder scheduling flow once implemented.
3. Use an execution prompt that requires a real tool call, for example: `Every hour, fetch the latest weather for Colombo and send me a short update.`
4. Wait for the next heartbeat tick.

## Expected behavior

1. A `background_executions` row is created with `scheduled`, then transitions to `running`.
2. The background agent calls the relevant tool and generates an outbound-ready message.
3. Telegram receives a new message in the target chat without any inbound user message, formatted distinctly from reminder nudges with the required `Proactive update:` prefix.
4. The execution transitions to `completed` and the reminder advances to its next fire time.

## Failure checks

1. Break one required tool path and verify the execution ends as `failed` with no misleading outbound message.
2. Force Telegram send failure and verify the execution ends as `delivery-failed` without duplicate sends on restart.
3. Produce output longer than 4096 characters and verify outbound delivery is split into multiple Telegram messages.
4. Force timeout expiry and verify the execution ends with a timeout-specific failure reason and subsequent heartbeat work is not blocked.
5. Simulate an inactive or disabled reminder and verify the execution is marked `cancelled` without delivery.
6. Simulate a missing adapter or invalid conversation ID and verify the execution is marked `failed` without delivery.
7. Restart the app with a stale `running` execution and verify startup recovery marks it failed with a recovery-specific reason rather than re-running it automatically.
8. Verify persisted diagnostics include tool usage metadata, failure reason, lifecycle timestamps, terminal-state timestamp, and successful delivery timestamp for completed runs.

## Validation gates

1. `npm run typecheck`
2. `npm run lint`
