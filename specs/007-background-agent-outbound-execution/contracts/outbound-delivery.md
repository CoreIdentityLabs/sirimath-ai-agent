# Contract: Outbound Delivery

## Purpose

Define the channel-agnostic contract for delivering proactive background execution results.

## Channel adapter contract

Existing contract remains the base interface:

```ts
export interface ChannelSendOptions {
  channelUserId: string;
  conversationId: string;
  text: string;
}

export interface ChannelAdapter {
  readonly channelId: string;
  send(opts: ChannelSendOptions): Promise<void>;
}
```

## Delivery requirements

1. `send()` must deliver the provided text to the target conversation without requiring a live inbound message context.
2. Channel-specific size handling must occur inside the adapter implementation.
3. Delivery retries are orchestrated by heartbeat/background runner logic against the same execution record and dedupe key, not by channel-specific dedupe rules.
4. Adapters should remain channel-agnostic with respect to reminder or execution lifecycle state.

## Telegram-specific expectations

For Telegram:

1. Text longer than 4096 characters must be split into ordered chunks.
2. Chunks must be sent sequentially to preserve readability.
3. Any thrown error is treated as a delivery failure by the caller.

## Idempotency boundary

Duplicate prevention is enforced by `background_executions.dedupeKey`, not by channel adapters.

## Eligibility boundary

Eligibility checks such as missing adapters, inactive reminders, invalid conversation IDs, or revoked access are handled before `send()` is called. Channel adapters are not responsible for deciding whether an execution should proceed.

Eligibility outcome mapping:

1. Inactive or disabled reminder state maps to `cancelled`.
2. Missing adapter, invalid conversation identifier, timeout after execution start, or delivery transport failure maps to `failed` or `delivery-failed` as appropriate.
