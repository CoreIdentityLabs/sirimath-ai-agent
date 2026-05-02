import type { Logger } from "@voltagent/logger";
import type { MemoryAwareAgentLike } from "../memory/index.js";
import { advanceFireAt } from "./next-fire-at.js";
import type { ChannelRegistry } from "./ports/channel-adapter.js";
import type { Reminder } from "./schema.js";
import { BackgroundExecutionStore } from "./background-execution-store.js";
import type { ReminderStore } from "./store.js";

export interface BackgroundRunnerDeps {
  agent: MemoryAwareAgentLike;
  executionStore: BackgroundExecutionStore;
  reminderStore: ReminderStore;
  registry: ChannelRegistry;
  log: Logger;
  timeoutMs: number;
  allowedChannelUserIds?: ReadonlySet<string>;
}

export class BackgroundRunner {
  constructor(private readonly deps: BackgroundRunnerDeps) {}

  private buildPrompt(reminder: Reminder): string {
    return [
      "Background heartbeat task.",
      "User is not present, so do not ask questions.",
      `Task: ${reminder.executionPrompt ?? reminder.description}`,
      "Use available tools when needed to get current data.",
      'Produce only the final user-facing message and begin it with "Proactive update:".',
      "Do not include internal reasoning.",
    ].join("\n");
  }

  private validateEligibility(
    reminder: Reminder,
  ):
    | { ok: true }
    | { ok: false; status: "cancelled" | "failed"; reason: string } {
    if (reminder.status !== "active") {
      return {
        ok: false,
        status: "cancelled",
        reason: "Reminder is no longer active",
      };
    }

    if (!reminder.conversationId) {
      return {
        ok: false,
        status: "failed",
        reason: "Missing conversation ID for background execution",
      };
    }

    if (!this.deps.registry.get(reminder.channelId)) {
      return {
        ok: false,
        status: "failed",
        reason: `Missing channel adapter for ${reminder.channelId}`,
      };
    }

    if (
      this.deps.allowedChannelUserIds &&
      this.deps.allowedChannelUserIds.size > 0 &&
      !this.deps.allowedChannelUserIds.has(reminder.channelUserId)
    ) {
      return {
        ok: false,
        status: "failed",
        reason: "Channel user is no longer authorized for background execution",
      };
    }

    if (reminder.mode !== "autonomous") {
      return {
        ok: false,
        status: "cancelled",
        reason: "Reminder is not configured for autonomous execution",
      };
    }

    if (!reminder.executionPrompt) {
      return {
        ok: false,
        status: "failed",
        reason: "Autonomous reminder is missing executionPrompt",
      };
    }

    return { ok: true };
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(`Background execution timed out after ${timeoutMs}ms`),
        );
      }, timeoutMs);

      promise.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }

  async runDueReminder(reminder: Reminder, scheduledFor: Date): Promise<void> {
    const execution = await this.deps.executionStore.createScheduled(
      reminder,
      scheduledFor,
    );

    if (!execution) {
      this.deps.log.info("[background] duplicate execution skipped", {
        reminderId: reminder.id,
        scheduledFor: scheduledFor.toISOString(),
      });
      return;
    }

    const eligibility = this.validateEligibility(reminder);
    if (!eligibility.ok) {
      if (eligibility.status === "cancelled") {
        await this.deps.executionStore.markCancelled(
          execution.id,
          eligibility.reason,
        );
      } else {
        await this.deps.executionStore.markFailed(
          execution.id,
          eligibility.reason,
        );
      }

      this.deps.log.warn("[background] execution aborted", {
        executionId: execution.id,
        status: eligibility.status,
        reason: eligibility.reason,
      });
      return;
    }

    await this.deps.executionStore.markRunning(execution.id);

    let resultText: string;
    let toolCallsJson: string | null = null;

    try {
      const result = await this.withTimeout(
        this.deps.agent.generateText({
          input: this.buildPrompt(reminder),
          channel: reminder.channelId,
          channelUserId: reminder.channelUserId,
          conversationId: reminder.conversationId,
        }),
        this.deps.timeoutMs,
      );

      resultText = result.text;
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : "Background generation failed";
      await this.deps.executionStore.markFailed(
        execution.id,
        failureReason,
        toolCallsJson,
      );
      this.deps.log.error("[background] generation failed", {
        executionId: execution.id,
        reminderId: reminder.id,
        error,
      });
      if (reminder.scheduleType === "once") {
        await this.deps.reminderStore.updateStatus(reminder.id, "completed");
      } else {
        await this.deps.reminderStore.advance(
          reminder.id,
          advanceFireAt(reminder),
        );
      }
      return;
    }

    const adapter = this.deps.registry.get(reminder.channelId);
    if (!adapter) {
      await this.deps.executionStore.markFailed(
        execution.id,
        `Missing channel adapter for ${reminder.channelId}`,
        toolCallsJson,
        resultText,
      );
      return;
    }

    try {
      await adapter.send({
        channelUserId: reminder.channelUserId,
        conversationId: reminder.conversationId,
        text: resultText,
      });
      await this.deps.executionStore.markCompleted(
        execution.id,
        resultText,
        toolCallsJson,
      );
      if (reminder.scheduleType === "once") {
        await this.deps.reminderStore.updateStatus(reminder.id, "completed");
      } else {
        await this.deps.reminderStore.advance(
          reminder.id,
          advanceFireAt(reminder),
        );
      }
      this.deps.log.info("[background] execution delivered", {
        executionId: execution.id,
        reminderId: reminder.id,
      });
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : "Background delivery failed";
      await this.deps.executionStore.markDeliveryFailed(
        execution.id,
        failureReason,
        resultText,
        toolCallsJson,
      );
      this.deps.log.error("[background] delivery failed", {
        executionId: execution.id,
        reminderId: reminder.id,
        error,
      });
    }
  }
}
