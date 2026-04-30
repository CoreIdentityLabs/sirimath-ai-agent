import type { Client, Row } from "@libsql/client";
import { type HeartbeatConfig, HeartbeatConfigSchema } from "./schema.js";

function rowToConfig(row: Row): HeartbeatConfig {
	return HeartbeatConfigSchema.parse({
		userIdentity: row[0],
		quietHoursStart: row[1],
		quietHoursEnd: row[2],
		quietDays: row[3] ? JSON.parse(row[3] as string) : null,
		digestEnabled: Boolean(row[4]),
		digestTime: row[5],
		digestChannelId: row[6],
		updatedAt: row[7],
	});
}

export class HeartbeatConfigStore {
	constructor(private readonly db: Client) {}

	async migrate(): Promise<void> {
		await this.db.execute(`
      CREATE TABLE IF NOT EXISTS heartbeat_config (
        userIdentity TEXT PRIMARY KEY,
        quietHoursStart TEXT, quietHoursEnd TEXT, quietDays TEXT,
        digestEnabled INTEGER NOT NULL DEFAULT 0,
        digestTime TEXT, digestChannelId TEXT, updatedAt TEXT NOT NULL
      )`);
	}

	async get(userIdentity: string): Promise<HeartbeatConfig | null> {
		const rs = await this.db.execute({
			sql: "SELECT * FROM heartbeat_config WHERE userIdentity=?",
			args: [userIdentity],
		});
		return rs.rows[0] ? rowToConfig(rs.rows[0]) : null;
	}

	async upsert(cfg: HeartbeatConfig): Promise<void> {
		await this.db.execute({
			sql: `INSERT INTO heartbeat_config VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(userIdentity) DO UPDATE SET
              quietHoursStart=excluded.quietHoursStart,
              quietHoursEnd=excluded.quietHoursEnd,
              quietDays=excluded.quietDays,
              digestEnabled=excluded.digestEnabled,
              digestTime=excluded.digestTime,
              digestChannelId=excluded.digestChannelId,
              updatedAt=excluded.updatedAt`,
			args: [
				cfg.userIdentity,
				cfg.quietHoursStart,
				cfg.quietHoursEnd,
				cfg.quietDays ? JSON.stringify(cfg.quietDays) : null,
				cfg.digestEnabled ? 1 : 0,
				cfg.digestTime,
				cfg.digestChannelId,
				cfg.updatedAt.toISOString(),
			],
		});
	}

	async getDigestUsers(digestTime: string): Promise<HeartbeatConfig[]> {
		const rs = await this.db.execute({
			sql: "SELECT * FROM heartbeat_config WHERE digestEnabled=1 AND digestTime=?",
			args: [digestTime],
		});
		return rs.rows.map(rowToConfig);
	}

	async delete(userIdentity: string): Promise<void> {
		await this.db.execute({
			sql: "DELETE FROM heartbeat_config WHERE userIdentity=?",
			args: [userIdentity],
		});
	}
}
