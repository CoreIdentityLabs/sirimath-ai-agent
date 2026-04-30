# Quickstart: Heartbeat & Proactive Task Reminders

**Feature**: 006-heartbeat-proactive-reminders  
**Audience**: Developer implementing this feature

---

## Prerequisites

- Feature branch `006-heartbeat-proactive-reminders` checked out
- `.env` configured (same as base project — no new required env vars for defaults)
- Neo4j running (optional; feature degrades gracefully without it)
- `npm install` completed

---

## New Optional Environment Variables

```bash
# .env additions (all optional — defaults shown)
HEARTBEAT_CRON="* * * * *"    # node-cron expression. Default: every minute
HEARTBEAT_QUIET_START=          # Global quiet-hours start HH:mm. Empty = no quiet hours
HEARTBEAT_QUIET_END=            # Global quiet-hours end HH:mm. Empty = no quiet hours
```

`HEARTBEAT_CRON` accepts any valid node-cron expression (5- or 6-field). Examples:

- `* * * * *` — every minute (default)
- `*/5 * * * *` — every 5 minutes
- `*/30 * * * * *` — every 30 seconds (6-field with seconds)

Per-user quiet hours and digest settings are configured via chat (stored in `heartbeat_config` table in `reminders.db`), not env vars.

---

## New Source Files

```
src/reminders/
├── schema.ts                   # Zod schemas for Reminder + HeartbeatConfig
├── store.ts                    # ReminderStore: LibSQL CRUD + SQLite migration
├── heartbeat-config-store.ts   # HeartbeatConfigStore: per-user config CRUD
├── heartbeat.ts                # startHeartbeat(): interval loop + dispatcher calls
├── dispatcher.ts               # ChannelDispatcher: retry logic + quiet-hours check
├── next-fire-at.ts             # nextFireAtFromSchedule() pure utility
└── ports/
    └── channel-adapter.ts      # ChannelAdapter interface + ChannelRegistry

src/channels/
└── telegram-channel-adapter.ts # TelegramChannelAdapter: calls bot.api.sendMessage

src/tools/
├── schedule-reminder.ts
├── snooze-reminder.ts
├── dismiss-reminder.ts
└── list-reminders.ts
```

---

## Key Code Walkthrough

### 1. Schema & DDL (src/reminders/schema.ts + store.ts)

The `ReminderStore` class opens a connection to `reminders.db` (`.voltagent/reminders.db`) — a **dedicated SQLite file separate from `memory.db`** — and runs a migration on first use:

```typescript
// src/reminders/store.ts (excerpt)
import Database from "@libsql/client"; // already a transitive dep via @voltagent/libsql

export class ReminderStore {
  constructor(private readonly db: import("@libsql/client").Client) {}

  async migrate(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY, userIdentity TEXT NOT NULL,
        channelId TEXT NOT NULL, channelUserId TEXT NOT NULL,
        conversationId TEXT NOT NULL, description TEXT NOT NULL,
        scheduleType TEXT NOT NULL, intervalMs INTEGER,
        timeOfDay TEXT, nextFireAt TEXT NOT NULL, lastFiredAt TEXT,
        deliveredCount INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active', createdAt TEXT NOT NULL
      )
    `);
    await this.db.execute(
      `CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders (status, nextFireAt)`,
    );
  }

  async insertReminder(
    r: Omit<Reminder, "deliveredCount" | "lastFiredAt">,
  ): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO reminders VALUES (?,?,?,?,?,?,?,?,?,?,NULL,0,'active',?)`,
      args: [
        r.id,
        r.userIdentity,
        r.channelId,
        r.channelUserId,
        r.conversationId,
        r.description,
        r.scheduleType,
        r.intervalMs ?? null,
        r.timeOfDay ?? null,
        r.nextFireAt.toISOString(),
        r.createdAt.toISOString(),
      ],
    });
  }

  async dueReminders(now: Date): Promise<Reminder[]> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM reminders WHERE status = 'active' AND nextFireAt <= ? ORDER BY nextFireAt ASC`,
      args: [now.toISOString()],
    });
    return rs.rows.map(rowToReminder);
  }

  async advanceNextFireAt(id: string, nextFireAt: Date): Promise<void> {
    await this.db.execute({
      sql: `UPDATE reminders SET nextFireAt=?, lastFiredAt=?, deliveredCount=deliveredCount+1 WHERE id=?`,
      args: [nextFireAt.toISOString(), new Date().toISOString(), id],
    });
  }

  async updateStatus(
    id: string,
    status: "dismissed" | "completed",
  ): Promise<void> {
    await this.db.execute({
      sql: `UPDATE reminders SET status=? WHERE id=?`,
      args: [status, id],
    });
  }

  async snooze(id: string, until: Date): Promise<void> {
    await this.db.execute({
      sql: `UPDATE reminders SET nextFireAt=? WHERE id=? AND status='active'`,
      args: [until.toISOString(), id],
    });
  }
}
```

### 2. Next-Fire-At Calculation (src/reminders/next-fire-at.ts)

```typescript
// src/reminders/next-fire-at.ts
import type { ScheduleReminderInput } from "./schema.js";

export function nextFireAtFromSchedule(
  input: Pick<
    ScheduleReminderInput,
    "scheduleType" | "intervalMs" | "timeOfDay" | "fireAt"
  >,
  now: Date,
): Date {
  switch (input.scheduleType) {
    case "recurring": {
      const ms = input.intervalMs ?? 3_600_000; // default 1h
      return new Date(now.getTime() + ms);
    }
    case "daily": {
      const [hh, mm] = (input.timeOfDay ?? "09:00").split(":").map(Number);
      const next = new Date(now);
      next.setHours(hh, mm, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next;
    }
    case "once": {
      if (!input.fireAt) throw new Error("fireAt required for once schedule");
      return new Date(input.fireAt);
    }
  }
}

export function advanceRecurringFireAt(
  current: Date,
  intervalMs: number,
): Date {
  return new Date(current.getTime() + intervalMs);
}
```

### 3. Channel Adapter Interface (src/reminders/ports/channel-adapter.ts)

```typescript
export interface ChannelSendOptions {
  channelUserId: string;
  conversationId: string;
  text: string;
}

export interface ChannelAdapter {
  readonly channelId: string;
  send(opts: ChannelSendOptions): Promise<void>;
}

export class ChannelRegistry {
  private readonly adapters = new Map<string, ChannelAdapter>();
  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.channelId, adapter);
  }
  get(channelId: string): ChannelAdapter | undefined {
    return this.adapters.get(channelId);
  }
}
```

### 4. Telegram Adapter (src/channels/telegram-channel-adapter.ts)

```typescript
import type { Bot } from "grammy";
import type {
  ChannelAdapter,
  ChannelSendOptions,
} from "../reminders/ports/channel-adapter.js";

export class TelegramChannelAdapter implements ChannelAdapter {
  readonly channelId = "telegram";
  constructor(private readonly bot: Bot) {}

  async send({ conversationId, text }: ChannelSendOptions): Promise<void> {
    await this.bot.api.sendMessage(conversationId, text);
  }
}
```

### 5. Heartbeat Loop (src/reminders/heartbeat.ts)

```typescript
import type { Logger } from "@voltagent/logger";
import type { ReminderStore } from "./store.js";
import type { HeartbeatConfigStore } from "./heartbeat-config-store.js";
import type { ChannelRegistry } from "./ports/channel-adapter.js";
import { advanceRecurringFireAt } from "./next-fire-at.js";

export interface HeartbeatOptions {
  intervalMs: number; // default 60_000
  quietStart?: string; // HH:mm global override
  quietEnd?: string;
}

function isInQuietHours(
  quietStart: string | null,
  quietEnd: string | null,
): boolean {
  if (!quietStart || !quietEnd) return false;
  const now = new Date();
  const [sh, sm] = quietStart.split(":").map(Number);
  const [eh, em] = quietEnd.split(":").map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return startMin < endMin
    ? nowMin >= startMin && nowMin < endMin
    : nowMin >= startMin || nowMin < endMin; // spans midnight
}

export function startHeartbeat(
  store: ReminderStore,
  configStore: HeartbeatConfigStore,
  registry: ChannelRegistry,
  log: Logger,
  opts: HeartbeatOptions = { intervalMs: 60_000 },
): () => void {
  const tick = async () => {
    const now = new Date();
    let due: Awaited<ReturnType<ReminderStore["dueReminders"]>>;
    try {
      due = await store.dueReminders(now);
    } catch (err) {
      log.error("[heartbeat] Failed to query due reminders", { err });
      return;
    }

    for (const reminder of due) {
      // Per-user quiet hours check
      const cfg = await configStore
        .get(reminder.userIdentity)
        .catch(() => null);
      const quietStart = cfg?.quietHoursStart ?? opts.quietStart ?? null;
      const quietEnd = cfg?.quietHoursEnd ?? opts.quietEnd ?? null;
      if (isInQuietHours(quietStart, quietEnd)) {
        log.debug("[heartbeat] Skipping reminder during quiet hours", {
          id: reminder.id,
        });
        continue;
      }

      const adapter = registry.get(reminder.channelId);
      if (!adapter) {
        log.warn("[heartbeat] No adapter registered for channel", {
          channelId: reminder.channelId,
        });
        continue;
      }

      const text = [
        `⏰ *Reminder*: ${reminder.description}`,
        `_(delivered ${reminder.deliveredCount + 1} time${reminder.deliveredCount > 0 ? "s" : ""})_`,
        `Reply "snooze [duration]" or "done" to manage this reminder.`,
      ].join("\n");

      let attempts = 0;
      let delivered = false;
      while (attempts < 3 && !delivered) {
        try {
          await adapter.send({
            channelUserId: reminder.channelUserId,
            conversationId: reminder.conversationId,
            text,
          });
          delivered = true;
        } catch (err) {
          attempts++;
          log.warn("[heartbeat] Delivery failed, retrying", {
            id: reminder.id,
            attempts,
            err,
          });
          if (attempts < 3)
            await new Promise((r) => setTimeout(r, 1000 * attempts));
        }
      }

      if (!delivered) {
        log.error("[heartbeat] Exhausted retries for reminder", {
          id: reminder.id,
        });
        continue;
      }

      // Advance schedule
      if (reminder.scheduleType === "once") {
        await store.updateStatus(reminder.id, "completed");
      } else {
        const next = advanceRecurringFireAt(
          new Date(reminder.nextFireAt),
          reminder.intervalMs!,
        );
        await store.advanceNextFireAt(reminder.id, next);
      }

      log.info("[heartbeat] Reminder delivered", {
        id: reminder.id,
        channelId: reminder.channelId,
      });
    }
  };

  // Fire immediately on startup (catches overdue reminders after restart)
  tick().catch((err) => log.error("[heartbeat] Initial tick failed", { err }));

  const timer = setInterval(
    () => tick().catch((err) => log.error("[heartbeat] Tick failed", { err })),
    opts.intervalMs,
  );
  return () => clearInterval(timer);
}
```

### 6. scheduleReminder Tool (src/tools/schedule-reminder.ts)

```typescript
import { createTool } from "@voltagent/core";
import { monotonicFactory } from "ulid";
import { ScheduleReminderInputSchema } from "../reminders/schema.js";
import { nextFireAtFromSchedule } from "../reminders/next-fire-at.js";
import type { ReminderStore } from "../reminders/store.js";
import { z } from "zod";

const ulid = monotonicFactory();

export function createScheduleReminderTool(store: ReminderStore) {
  return createTool({
    name: "scheduleReminder",
    description:
      "Schedule a proactive reminder for the user. Call this after the user confirms a reminder cadence for a follow-up item.",
    parameters: ScheduleReminderInputSchema,
    execute: async (input) => {
      const id = ulid();
      const nextFireAt = nextFireAtFromSchedule(input, new Date());
      await store.insertReminder({
        id,
        userIdentity: input.userIdentity,
        channelId: input.channelId,
        channelUserId: input.channelUserId,
        conversationId: input.conversationId,
        description: input.description,
        scheduleType: input.scheduleType,
        intervalMs: input.intervalMs ?? null,
        timeOfDay: input.timeOfDay ?? null,
        nextFireAt,
        status: "active",
        createdAt: new Date(),
      });
      return {
        reminderId: id,
        nextFireAt: nextFireAt.toISOString(),
        message: `Reminder scheduled. I'll check in with you at ${nextFireAt.toLocaleString()}.`,
      };
    },
  });
}
```

### 7. Agent Instructions Update (src/index.ts excerpt)

The agent's `instructions` string gains these additions:

```typescript
`When a user mentions a task, follow-up item, or anything they want to be reminded about:
1. Acknowledge the item.
2. BEFORE ending your response, ask: "When should I remind you about this? For example: every 6 hours, daily at 9 AM, or in 3 days."
3. When the user provides a cadence, call the scheduleReminder tool with the appropriate scheduleType and interval.
4. Confirm the scheduled time back to the user.

When a user says "snooze", "remind me later", or specifies a snooze duration in reply to a reminder:
- Call listReminders to find the most recently delivered reminder.
- Call snoozeReminder with the reminder ID and computed snoozeMs.

When a user says "done", "dismiss", "ignore", or "completed" in reply to a reminder:
- Call listReminders to find the most recently delivered reminder.
- Call dismissReminder with markCompleted = true for "done"/"completed", false for "dismiss"/"ignore".

When a user asks to see their reminders or open tasks, call listReminders.`;
```

### 8. Wiring in src/index.ts

```typescript
// New imports
import { createClient } from "@libsql/client";
import { ReminderStore } from "./reminders/store.js";
import { HeartbeatConfigStore } from "./reminders/heartbeat-config-store.js";
import { ChannelRegistry } from "./reminders/ports/channel-adapter.js";
import { startHeartbeat } from "./reminders/heartbeat.js";
import {
  createScheduleReminderTool,
  createSnoozeReminderTool,
  createDismissReminderTool,
  createListRemindersTool,
} from "./tools/index.js";

// After existing DB setup:
// Dedicated DB for reminders — separate from the memory subsystem's memory.db
const remindersDb = createClient({ url: "file:./.voltagent/reminders.db" });
const reminderStore = new ReminderStore(remindersDb);
await reminderStore.migrate();
const heartbeatConfigStore = new HeartbeatConfigStore(remindersDb);
await heartbeatConfigStore.migrate();

const channelRegistry = new ChannelRegistry();

// Tools now take the store as a dependency
const reminderTools = [
  createScheduleReminderTool(reminderStore),
  createSnoozeReminderTool(reminderStore),
  createDismissReminderTool(reminderStore),
  createListRemindersTool(reminderStore),
];

// Pass channelRegistry to telegram
await startTelegramBot(agent, logger, channelRegistry, voiceProvider);

// Start heartbeat AFTER channel adapter is registered
const stopHeartbeat = startHeartbeat(
  reminderStore,
  heartbeatConfigStore,
  channelRegistry,
  logger,
  { cronExpression: process.env.HEARTBEAT_CRON ?? "* * * * *" },
);

// Add to VoltAgent shutdown (if supported) or process signal:
process.on("SIGTERM", () => {
  stopHeartbeat();
  memorySubsystem.stop();
});
process.on("SIGINT", () => {
  stopHeartbeat();
  memorySubsystem.stop();
  process.exit(0);
});
```

---

## Running Locally

```bash
# Start with heartbeat running every 10 seconds for quick testing
HEARTBEAT_CRON="*/10 * * * * *" npm run dev
```

Then in Telegram:

1. Say: "Remind me to review the Q2 report"
2. Sirimath replies and asks for a cadence
3. Reply: "every 6 hours"
4. Sirimath confirms with the next fire time
5. Wait for the heartbeat to fire (10s in test mode) — you'll receive a proactive message
6. Reply "snooze 30 minutes" or "done"

---

## Testing the Digest

```bash
# Set digest time to 1 minute from now in HH:mm
# Then tell Sirimath via chat:
# "Set my daily digest to [current-time + 1min]"
```

---

## .env.example additions

```bash
# Heartbeat
HEARTBEAT_INTERVAL_MS=60000    # Heartbeat scan interval in ms (default: 60000)
HEARTBEAT_QUIET_START=         # Global quiet hours start HH:mm (e.g. 22:00)
HEARTBEAT_QUIET_END=           # Global quiet hours end HH:mm  (e.g. 08:00)
```
