import type { Client, Row } from "@libsql/client";
import { type Reminder, ReminderSchema } from "./schema.js";

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
		createdAt: row[13],
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
        createdAt TEXT NOT NULL
      )`);
		await this.db.execute(
			"CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders (status, nextFireAt)",
		);
	}

	async insert(
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
			sql: `SELECT * FROM reminders WHERE status = 'active' AND nextFireAt <= ?
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
			sql: `SELECT * FROM reminders WHERE userIdentity=? AND ${clause}
            ORDER BY nextFireAt ASC LIMIT 50`,
			args: [userIdentity],
		});
		return rs.rows.map(rowToReminder);
	}
}
