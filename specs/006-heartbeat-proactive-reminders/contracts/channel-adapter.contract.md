# Contract: Channel Adapter

**Feature**: 006-heartbeat-proactive-reminders  
**Module**: `src/reminders/ports/channel-adapter.ts`

---

## Purpose

The `ChannelAdapter` interface is the single extension point for outbound proactive messaging. Any communication channel (Telegram, Slack, SMS, …) that implements this interface can receive heartbeat-dispatched reminders without any changes to the reminder store, heartbeat loop, or tools.

---

## Interface Definition

```typescript
// src/reminders/ports/channel-adapter.ts

export interface ChannelSendOptions {
  /** Channel-specific user identifier (e.g. Telegram user ID as string). */
  channelUserId: string;
  /** Channel-specific conversation/chat ID to send into. */
  conversationId: string;
  /** Plain-text message body. Channel adapters MAY apply channel-specific formatting. */
  text: string;
}

export interface ChannelAdapter {
  /**
   * Unique stable identifier for this channel, lowercase alphanumeric + hyphens.
   * Must match the `channelId` stored on `Reminder` rows.
   * Examples: "telegram", "slack", "discord"
   */
  readonly channelId: string;

  /**
   * Deliver a message to the given user on this channel.
   * MUST throw on unrecoverable failure (adapter-level retry is acceptable internally).
   * The heartbeat dispatcher handles top-level retry with back-off.
   */
  send(opts: ChannelSendOptions): Promise<void>;
}
```

---

## ChannelRegistry

```typescript
// src/reminders/channel-registry.ts

import type { ChannelAdapter } from "./ports/channel-adapter.js";

export class ChannelRegistry {
  private readonly adapters = new Map<string, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.channelId, adapter);
  }

  get(channelId: string): ChannelAdapter | undefined {
    return this.adapters.get(channelId);
  }

  ids(): string[] {
    return [...this.adapters.keys()];
  }
}
```

---

## Telegram Adapter Contract

**Module**: `src/channels/telegram-channel-adapter.ts`

```typescript
import { Bot } from "grammy";
import type {
  ChannelAdapter,
  ChannelSendOptions,
} from "../reminders/ports/channel-adapter.js";

export class TelegramChannelAdapter implements ChannelAdapter {
  readonly channelId = "telegram";

  constructor(private readonly bot: Bot) {}

  async send({ conversationId, text }: ChannelSendOptions): Promise<void> {
    // conversationId is the Telegram chat ID (string representation of number)
    await this.bot.api.sendMessage(conversationId, text);
  }
}
```

**Wiring** (inside `startTelegramBot`):

```typescript
export async function startTelegramBot(
  agent: MemoryAwareAgentLike,
  logger: Logger,
  channelRegistry: ChannelRegistry, // ← new parameter
  voiceProvider?: Voice | null,
): Promise<void> {
  // ...existing bot setup...
  const bot = new Bot(token);
  channelRegistry.register(new TelegramChannelAdapter(bot));
  // ...rest of handler setup unchanged...
}
```

---

## Adding a New Channel

To add a new channel (e.g., Slack):

1. Create `src/channels/slack-channel-adapter.ts` implementing `ChannelAdapter` with `channelId = "slack"`.
2. In `src/index.ts`, instantiate and call `channelRegistry.register(new SlackChannelAdapter(...))`.
3. No changes to `src/reminders/` or any tool.

---

## Guarantees

- `send()` is called with the exact `channelUserId` and `conversationId` stored at reminder creation time.
- `send()` receives fully-formatted plain text; no markdown escaping is the adapter's concern (adapters MAY re-encode for their protocol).
- The dispatcher never calls `send()` on a channel that is not registered; it logs and skips unknown `channelId` values.
