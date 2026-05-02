import type { Client, Row } from "@libsql/client";
import { monotonicFactory } from "ulid";
import {
  type BackgroundExecution,
  BackgroundExecutionSchema,
  type BackgroundExecutionStatus,
  type Reminder,
} from "./schema.js";

const ulid = monotonicFactory();

function rowToBackgroundExecution(row: Row): BackgroundExecution {
  return BackgroundExecutionSchema.parse({
    id: row[0],
    reminderId: row[1],
    userIdentity: row[2],
    channelId: row[3],
    channelUserId: row[4],
    conversationId: row[5],
    scheduledFor: row[6],
    startedAt: row[7],
    finishedAt: row[8],
    status: row[9],
    dedupeKey: row[10],
    toolCallsJson: row[11],
    resultText: row[12],
    failureReason: row[13],
    deliveryMessageId: row[14],
    createdAt: row[15],
  });
}

export class BackgroundExecutionStore {
  constructor(private readonly db: Client) {}

  async migrate(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS background_executions (
        id TEXT PRIMARY KEY,
        reminderId TEXT NOT NULL,
        userIdentity TEXT NOT NULL,
        channelId TEXT NOT NULL,
        channelUserId TEXT NOT NULL,
        conversationId TEXT NOT NULL,
        scheduledFor TEXT NOT NULL,
        startedAt TEXT,
        finishedAt TEXT,
        status TEXT NOT NULL
          CHECK(status IN ('scheduled','running','completed','failed','delivery-failed','cancelled')),
        dedupeKey TEXT NOT NULL UNIQUE,
        toolCallsJson TEXT,
        resultText TEXT,
        failureReason TEXT,
        deliveryMessageId TEXT,
        createdAt TEXT NOT NULL
      )`);
    await this.db.execute(
      "CREATE INDEX IF NOT EXISTS idx_background_executions_status ON background_executions (status, scheduledFor)",
    );
    await this.db.execute(
      "CREATE INDEX IF NOT EXISTS idx_background_executions_reminder ON background_executions (reminderId, scheduledFor)",
    );
  }

  buildDedupeKey(reminderId: string, scheduledFor: Date): string {
    return `${reminderId}:${scheduledFor.toISOString()}`;
  }

  async createScheduled(
    reminder: Reminder,
    scheduledFor: Date,
  ): Promise<BackgroundExecution | null> {
    const execution: BackgroundExecution = {
      id: ulid(),
      reminderId: reminder.id,
      userIdentity: reminder.userIdentity,
      channelId: reminder.channelId,
      channelUserId: reminder.channelUserId,
      conversationId: reminder.conversationId,
      scheduledFor,
      startedAt: null,
      finishedAt: null,
      status: "scheduled",
      dedupeKey: this.buildDedupeKey(reminder.id, scheduledFor),
      toolCallsJson: null,
      resultText: null,
      failureReason: null,
      deliveryMessageId: null,
      createdAt: new Date(),
    };

    try {
      await this.db.execute({
        sql: `INSERT INTO background_executions (
					id, reminderId, userIdentity, channelId, channelUserId,
					conversationId, scheduledFor, startedAt, finishedAt, status,
					dedupeKey, toolCallsJson, resultText, failureReason,
					deliveryMessageId, createdAt
				) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          execution.id,
          execution.reminderId,
          execution.userIdentity,
          execution.channelId,
          execution.channelUserId,
          execution.conversationId,
          execution.scheduledFor.toISOString(),
          null,
          null,
          execution.status,
          execution.dedupeKey,
          null,
          null,
          null,
          null,
          execution.createdAt.toISOString(),
        ],
      });
      return execution;
    } catch {
      return null;
    }
  }

  async getById(id: string): Promise<BackgroundExecution | null> {
    const rs = await this.db.execute({
      sql: "SELECT * FROM background_executions WHERE id=?",
      args: [id],
    });
    return rs.rows[0] ? rowToBackgroundExecution(rs.rows[0]) : null;
  }

  async updateStatus(
    id: string,
    status: BackgroundExecutionStatus,
    options?: {
      startedAt?: Date | null;
      finishedAt?: Date | null;
      toolCallsJson?: string | null;
      resultText?: string | null;
      failureReason?: string | null;
      deliveryMessageId?: string | null;
    },
  ): Promise<void> {
    await this.db.execute({
      sql: `UPDATE background_executions
				SET status=?, startedAt=COALESCE(?, startedAt), finishedAt=COALESCE(?, finishedAt),
					toolCallsJson=COALESCE(?, toolCallsJson), resultText=COALESCE(?, resultText),
					failureReason=COALESCE(?, failureReason), deliveryMessageId=COALESCE(?, deliveryMessageId)
				WHERE id=?`,
      args: [
        status,
        options?.startedAt?.toISOString() ?? null,
        options?.finishedAt?.toISOString() ?? null,
        options?.toolCallsJson ?? null,
        options?.resultText ?? null,
        options?.failureReason ?? null,
        options?.deliveryMessageId ?? null,
        id,
      ],
    });
  }

  async markRunning(id: string): Promise<void> {
    await this.updateStatus(id, "running", { startedAt: new Date() });
  }

  async markCompleted(
    id: string,
    resultText: string,
    toolCallsJson?: string | null,
    deliveryMessageId?: string | null,
  ): Promise<void> {
    await this.updateStatus(id, "completed", {
      finishedAt: new Date(),
      resultText,
      toolCallsJson: toolCallsJson ?? null,
      deliveryMessageId: deliveryMessageId ?? null,
    });
  }

  async markFailed(
    id: string,
    failureReason: string,
    toolCallsJson?: string | null,
    resultText?: string | null,
  ): Promise<void> {
    await this.updateStatus(id, "failed", {
      finishedAt: new Date(),
      failureReason,
      toolCallsJson: toolCallsJson ?? null,
      resultText: resultText ?? null,
    });
  }

  async markDeliveryFailed(
    id: string,
    failureReason: string,
    resultText: string,
    toolCallsJson?: string | null,
  ): Promise<void> {
    await this.updateStatus(id, "delivery-failed", {
      finishedAt: new Date(),
      failureReason,
      resultText,
      toolCallsJson: toolCallsJson ?? null,
    });
  }

  async markCancelled(id: string, failureReason: string): Promise<void> {
    await this.updateStatus(id, "cancelled", {
      finishedAt: new Date(),
      failureReason,
    });
  }

  async recoverStaleRunning(
    reason = "Recovered on startup after interrupted background execution",
  ): Promise<number> {
    const rs = await this.db.execute({
      sql: `UPDATE background_executions
				SET status='failed', finishedAt=?, failureReason=COALESCE(failureReason, ?)
				WHERE status='running'`,
      args: [new Date().toISOString(), reason],
    });
    return Number(rs.rowsAffected ?? 0);
  }
}
