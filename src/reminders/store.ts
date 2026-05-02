import type { Client, InStatement, Row } from "@libsql/client";
import { type Reminder, ReminderSchema } from "./schema.js";

const REMINDER_COLUMNS = `
  id,
  userIdentity,
  channelId,
  channelUserId,
  conversationId,
  description,
  scheduleType,
  intervalMs,
  timeOfDay,
  nextFireAt,
  lastFiredAt,
  deliveredCount,
  status,
  mode,
  executionPrompt,
  toolPolicy,
  createdAt
`;

function rowToReminder(row: Row): Reminder {
  return ReminderSchema.parse({
    id: row[0],
    userIdentity: row[1],
    channelId: row[2],
    channelUserId: row[3],
    conversationId: row[4],
    description: row[5],
    scheduleType: row[6],
    intervalMs: row[7],
    timeOfDay: row[8],
    nextFireAt: row[9],
    lastFiredAt: row[10],
    deliveredCount: row[11],
    status: row[12],
    mode: row[13],
    executionPrompt: row[14],
    toolPolicy: row[15],
    createdAt: row[16],
  });
}

export class ReminderStore {
  constructor(private readonly db: Client) {}

  async migrate(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY, userIdentity TEXT NOT NULL,
        channelId TEXT NOT NULL, channelUserId TEXT NOT NULL,
        conversationId TEXT NOT NULL, description TEXT NOT NULL,
        scheduleType TEXT NOT NULL CHECK(scheduleType IN ('recurring','daily','once')),
        intervalMs INTEGER, timeOfDay TEXT,
        nextFireAt TEXT NOT NULL, lastFiredAt TEXT,
        deliveredCount INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active'
               CHECK(status IN ('active','delivering','dismissed','completed')),
        mode TEXT NOT NULL DEFAULT 'notify'
             CHECK(mode IN ('notify','autonomous')),
        executionPrompt TEXT,
        toolPolicy TEXT NOT NULL DEFAULT 'all-interactive-tools'
             CHECK(toolPolicy IN ('all-interactive-tools')),
        createdAt TEXT NOT NULL
      )`);
    await this.db
      .execute(
        "ALTER TABLE reminders ADD COLUMN mode TEXT NOT NULL DEFAULT 'notify' CHECK(mode IN ('notify','autonomous'))",
      )
      .catch(() => {});
    await this.db
      .execute("ALTER TABLE reminders ADD COLUMN executionPrompt TEXT")
      .catch(() => {});
    await this.db
      .execute(
        "ALTER TABLE reminders ADD COLUMN toolPolicy TEXT NOT NULL DEFAULT 'all-interactive-tools' CHECK(toolPolicy IN ('all-interactive-tools'))",
      )
      .catch(() => {});
    await this.db.execute(
      "CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders (status, nextFireAt)",
    );
    await this.db.execute(
      "CREATE INDEX IF NOT EXISTS idx_reminders_mode_fire ON reminders (mode, status, nextFireAt)",
    );
  }

  async insert(
    r: Omit<Reminder, "deliveredCount" | "lastFiredAt">,
  ): Promise<void> {
    const statement: InStatement = {
      sql: `INSERT INTO reminders (
				id, userIdentity, channelId, channelUserId, conversationId,
				description, scheduleType, intervalMs, timeOfDay, nextFireAt,
				lastFiredAt, deliveredCount, status, mode, executionPrompt,
				toolPolicy, createdAt
			) VALUES (?,?,?,?,?,?,?,?,?,?,NULL,0,'active',?,?,?,?)`,
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
        r.mode,
        r.executionPrompt ?? null,
        r.toolPolicy,
        r.createdAt.toISOString(),
      ],
    };
    await this.db.execute(statement);
  }

  async dueReminders(now: Date): Promise<Reminder[]> {
    const rs = await this.db.execute({
      sql: `SELECT ${REMINDER_COLUMNS} FROM reminders WHERE status = 'active' AND nextFireAt <= ?
            ORDER BY nextFireAt ASC LIMIT 100`,
      args: [now.toISOString()],
    });
    return rs.rows.map(rowToReminder);
  }

  async advance(id: string, nextFireAt: Date): Promise<void> {
    await this.db.execute({
      sql: `UPDATE reminders
            SET nextFireAt=?, lastFiredAt=?, deliveredCount=deliveredCount+1, status='active'
            WHERE id=?`,
      args: [nextFireAt.toISOString(), new Date().toISOString(), id],
    });
  }

  async updateStatus(
    id: string,
    status: "delivering" | "dismissed" | "completed" | "active",
  ): Promise<void> {
    await this.db.execute({
      sql: "UPDATE reminders SET status=? WHERE id=?",
      args: [status, id],
    });
  }

  async snooze(id: string, until: Date): Promise<void> {
    await this.db.execute({
      sql: `UPDATE reminders SET nextFireAt=?, status='active' WHERE id=? AND status IN ('active','delivering')`,
      args: [until.toISOString(), id],
    });
  }

  async recoverStaleDelivering(): Promise<number> {
    const rs = await this.db.execute(
      "UPDATE reminders SET status='active' WHERE status='delivering'",
    );
    return Number(rs.rowsAffected ?? 0);
  }

  async listForUser(
    userIdentity: string,
    includeDelivered: boolean,
  ): Promise<Reminder[]> {
    const clause = includeDelivered
      ? `status IN ('active','completed')`
      : `status = 'active'`;
    const rs = await this.db.execute({
      sql: `SELECT ${REMINDER_COLUMNS} FROM reminders WHERE userIdentity=? AND ${clause}
            ORDER BY nextFireAt ASC LIMIT 50`,
      args: [userIdentity],
    });
    return rs.rows.map(rowToReminder);
  }
}
