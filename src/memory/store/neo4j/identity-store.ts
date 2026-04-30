import { randomBytes } from "node:crypto";
import type { Logger } from "@voltagent/logger";
import type { Driver } from "neo4j-driver";
import { ulid } from "ulid";
import type { IdentityStore } from "../../ports/identity-store.js";
import type { ChannelIdentityMapping } from "../../schema.js";

export class Neo4jIdentityStore implements IdentityStore {
	constructor(
		private driver: Driver,
		private log: Logger,
	) {}

	async resolveOrCreate(
		channel: string,
		channelUserId: string,
	): Promise<string> {
		const start = Date.now();
		const session = this.driver.session();
		try {
			const result = await session.run(
				`MERGE (cim:ChannelIdentityMapping {channel: $channel, channelUserId: $channelUserId})
ON CREATE SET cim.mappingId = $mappingId, cim.userIdentity = $newUserIdentity, cim.linkedAt = datetime()
MERGE (u:UserIdentity {userIdentity: cim.userIdentity})
ON CREATE SET u.createdAt = datetime()
MERGE (cim)-[:BELONGS_TO]->(u)
RETURN u.userIdentity AS userIdentity`,
				{
					channel,
					channelUserId,
					mappingId: ulid(),
					newUserIdentity: ulid(),
				},
			);

			const userIdentity = result.records[0]?.get("userIdentity") as string;
			const durationMs = Date.now() - start;
			this.log.info("[memory:identity] resolveOrCreate", {
				channel,
				durationMs,
			});
			return userIdentity;
		} catch (err) {
			this.log.warn("[memory:identity] resolveOrCreate failed", {
				channel,
				err,
			});
			throw err;
		} finally {
			await session.close();
		}
	}

	async issuePairingCode(
		userIdentity: string,
		issuingChannel: string,
	): Promise<{ code: string; expiresAt: Date }> {
		const code = randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min TTL
		const session = this.driver.session();
		try {
			await session.run(
				`MERGE (u:UserIdentity {userIdentity: $userIdentity})
				CREATE (p:PairingCode {
					code: $code,
					userIdentity: $userIdentity,
					issuingChannel: $issuingChannel,
					expiresAt: $expiresAt,
					consumed: false
				})-[:BELONGS_TO]->(u)`,
				{
					userIdentity,
					code,
					issuingChannel,
					expiresAt: expiresAt.toISOString(),
				},
			);
			this.log.info("[identity] Pairing code issued", {
				userIdentity,
				issuingChannel,
			});
			return { code, expiresAt };
		} finally {
			await session.close();
		}
	}

	async consumePairingCode(
		newChannel: string,
		newChannelUserId: string,
		code: string,
	): Promise<
		| { ok: true; userIdentity: string }
		| { ok: false; reason: "expired" | "consumed" | "same_channel" | "unknown" }
	> {
		const session = this.driver.session();
		try {
			return await session.executeWrite(async (tx) => {
				// Atomically check all conditions and consume in one query.
				const consumeResult = await tx.run(
					`MATCH (p:PairingCode {code: $code})
					WHERE NOT p.consumed AND p.expiresAt > datetime() AND p.issuingChannel <> $newChannel
					SET p.consumed = true
					RETURN p.userIdentity AS userIdentity`,
					{ code, newChannel },
				);

				if (consumeResult.records.length === 0) {
					// Determine the failure reason (non-critical — best effort).
					const reasonResult = await tx.run(
						`MATCH (p:PairingCode {code: $code})
						RETURN p.consumed AS consumed, p.expiresAt AS expiresAt, p.issuingChannel AS issuingChannel`,
						{ code },
					);
					if (reasonResult.records.length === 0)
						return { ok: false, reason: "unknown" };
					const r = reasonResult.records[0];
					if (r.get("consumed") === true)
						return { ok: false, reason: "consumed" };
					if (new Date(r.get("expiresAt") as string) < new Date())
						return { ok: false, reason: "expired" };
					if ((r.get("issuingChannel") as string) === newChannel)
						return { ok: false, reason: "same_channel" };
					return { ok: false, reason: "unknown" };
				}

				const userIdentity = consumeResult.records[0].get(
					"userIdentity",
				) as string;

				// Reject if the channel is already owned by a different user.
				const conflictResult = await tx.run(
					`MATCH (cim:ChannelIdentityMapping {channel: $newChannel, channelUserId: $newChannelUserId})
					WHERE cim.userIdentity <> $userIdentity
					RETURN cim.userIdentity AS existingOwner`,
					{ newChannel, newChannelUserId, userIdentity },
				);
				if (conflictResult.records.length > 0) {
					// Undo the consume so the code remains usable.
					await tx.run(
						"MATCH (p:PairingCode {code: $code}) SET p.consumed = false",
						{ code },
					);
					return { ok: false, reason: "unknown" };
				}

				// Link the new channel to the user.
				await tx.run(
					`MATCH (u:UserIdentity {userIdentity: $userIdentity})
					MERGE (cim:ChannelIdentityMapping {channel: $newChannel, channelUserId: $newChannelUserId})
					ON CREATE SET cim.mappingId = $mappingId, cim.userIdentity = $userIdentity, cim.linkedAt = datetime()
					ON MATCH SET cim.userIdentity = $userIdentity
					MERGE (cim)-[:BELONGS_TO]->(u)`,
					{ userIdentity, newChannel, newChannelUserId, mappingId: ulid() },
				);

				this.log.info("[identity] Pairing code consumed", {
					userIdentity,
					newChannel,
				});
				return { ok: true, userIdentity };
			});
		} finally {
			await session.close();
		}
	}

	async listChannels(userIdentity: string): Promise<ChannelIdentityMapping[]> {
		const session = this.driver.session();
		try {
			const result = await session.run(
				`MATCH (cim:ChannelIdentityMapping)-[:BELONGS_TO]->(u:UserIdentity {userIdentity: $userIdentity})
RETURN cim.mappingId AS mappingId, cim.userIdentity AS userIdentity, cim.channel AS channel, cim.channelUserId AS channelUserId, cim.linkedAt AS linkedAt`,
				{ userIdentity },
			);

			return result.records.map((r) => ({
				mappingId: r.get("mappingId") as string,
				userIdentity: r.get("userIdentity") as string,
				channel: r.get("channel") as string,
				channelUserId: r.get("channelUserId") as string,
				linkedAt: new Date(r.get("linkedAt")),
			}));
		} finally {
			await session.close();
		}
	}
}
