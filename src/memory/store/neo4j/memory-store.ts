import type { Logger } from "@voltagent/logger";
import { int, isInt } from "neo4j-driver";
import type { Driver } from "neo4j-driver";
import { ulid } from "ulid";
import type { MemoryStore } from "../../ports/memory-store.js";
import type {
	ConsolidationReport,
	ConversationRecord,
	MemoryItem,
	Relationship,
	UserProfile,
} from "../../schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFtsQuery(q: string): string {
	return q
		.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

type AnyRecord = { get(key: string): unknown };

function toDate(val: unknown): Date {
	return new Date((val as { toString(): string }).toString());
}

function toDateOrNull(val: unknown): Date | null {
	if (val == null) return null;
	return new Date((val as { toString(): string }).toString());
}

function toNum(val: unknown): number {
	if (val == null) return 0;
	if (isInt(val)) return val.toNumber();
	if (typeof val === "number") return val;
	return Number(val);
}

function mapMemoryItem(rec: AnyRecord): MemoryItem {
	return {
		itemId: rec.get("itemId") as string,
		userIdentity: rec.get("userIdentity") as string,
		type: rec.get("type") as MemoryItem["type"],
		description: rec.get("description") as string,
		sourceConversationId: rec.get("sourceConversationId") as string,
		validFrom: toDate(rec.get("validFrom")),
		validUntil: toDateOrNull(rec.get("validUntil")),
		accessCount: toNum(rec.get("accessCount")),
		lastAccessedAt: toDateOrNull(rec.get("lastAccessedAt")),
		createdAt: toDate(rec.get("createdAt")),
		redacted: (rec.get("redacted") as boolean | null | undefined) ?? false,
	};
}

// ---------------------------------------------------------------------------
// Neo4jMemoryStore
// ---------------------------------------------------------------------------

export class Neo4jMemoryStore implements MemoryStore {
	constructor(
		private driver: Driver,
		private log: Logger,
	) {}

	// -------------------------------------------------------------------------
	// persistConversationRecord
	// -------------------------------------------------------------------------

	async persistConversationRecord(record: ConversationRecord): Promise<void> {
		const session = this.driver.session();
		try {
			await session.executeWrite((tx) =>
				tx.run(
					`
					MERGE (c:ConversationRecord {userIdentity: $userIdentity, conversationId: $conversationId})
					ON CREATE SET c.channel = $channel, c.startedAt = $startedAt, c.transcript = $transcript
					ON MATCH SET c.endedAt = $endedAt, c.transcript = $transcript
					MERGE (u:UserIdentity {userIdentity: $userIdentity})
					MERGE (c)-[:WITH]->(u)
					`,
					{
						userIdentity: record.userIdentity,
						conversationId: record.conversationId,
						channel: record.channel,
						startedAt: record.startedAt.toISOString(),
						endedAt: record.endedAt?.toISOString() ?? null,
						transcript: JSON.stringify(
							record.transcript.map((t) => ({
								role: t.role,
								content: t.content,
								at: t.at.toISOString(),
							})),
						),
					},
				),
			);
		} finally {
			await session.close();
		}
	}

	// -------------------------------------------------------------------------
	// addMemoryItem
	// -------------------------------------------------------------------------

	async addMemoryItem(item: MemoryItem): Promise<void> {
		const session = this.driver.session();
		try {
			// Check for supersession candidates via FTS
			const ftsQ = sanitizeFtsQuery(item.description);
			let candidates: string[] = [];

			if (ftsQ.length > 0) {
				const candidateResult = await session.executeRead((tx) =>
					tx.run(
						`
						CALL db.index.fulltext.queryNodes('memoryItemDesc', $desc)
						YIELD node, score
						WHERE node.userIdentity = $userIdentity AND node.type = $type AND node.validUntil IS NULL AND score > 1.5
						RETURN node.itemId AS itemId LIMIT 3
						`,
						{
							desc: ftsQ,
							userIdentity: item.userIdentity,
							type: item.type,
						},
					),
				);
				candidates = candidateResult.records.map(
					(r) => r.get("itemId") as string,
				);
			}

			// Persist the new item
			await session.executeWrite((tx) =>
				tx.run(
					`
					MERGE (m:MemoryItem {itemId: $itemId})
					ON CREATE SET
					  m.userIdentity = $userIdentity,
					  m.type = $type,
					  m.description = $description,
					  m.sourceConversationId = $sourceConversationId,
					  m.validFrom = $validFrom,
					  m.validUntil = null,
					  m.accessCount = 0,
					  m.lastAccessedAt = null,
					  m.createdAt = $createdAt,
					  m.redacted = $redacted
					MERGE (u:UserIdentity {userIdentity: $userIdentity})
					MERGE (c:ConversationRecord {userIdentity: $userIdentity, conversationId: $sourceConversationId})
					MERGE (m)-[:OWNED_BY]->(u)
					MERGE (m)-[:SOURCED_FROM]->(c)
					`,
					{
						itemId: item.itemId,
						userIdentity: item.userIdentity,
						type: item.type,
						description: item.description,
						sourceConversationId: item.sourceConversationId,
						validFrom: item.validFrom.toISOString(),
						createdAt: item.createdAt.toISOString(),
						redacted: item.redacted,
					},
				),
			);

			// Create supersession edges for each candidate
			for (const oldItemId of candidates) {
				const relId = ulid();
				await session.executeWrite((tx) =>
					tx.run(
						`
						MATCH (old:MemoryItem {itemId: $oldItemId})
						SET old.validUntil = datetime()
						WITH old
						MATCH (new:MemoryItem {itemId: $newItemId})
						MERGE (new)-[r:SUPERSEDES {relationshipId: $relId}]->(old)
						ON CREATE SET r.userIdentity = $userIdentity, r.confidence = 1.0, r.description = 'superseded by newer fact', r.createdAt = datetime(), r.type = 'supersedes'
						`,
						{
							oldItemId,
							newItemId: item.itemId,
							relId,
							userIdentity: item.userIdentity,
						},
					),
				);
			}
		} finally {
			await session.close();
		}
	}

	// -------------------------------------------------------------------------
	// addRelationship
	// -------------------------------------------------------------------------

	async addRelationship(rel: Relationship): Promise<void> {
		const session = this.driver.session();

		const params = {
			fromItemId: rel.fromItemId,
			toItemId: rel.toItemId,
			relationshipId: rel.relationshipId,
			userIdentity: rel.userIdentity,
			confidence: rel.confidence,
			description: rel.description,
			createdAt: rel.createdAt.toISOString(),
			type: rel.type,
		};

		const queryFor = (label: string) => `
			MATCH (from:MemoryItem {itemId: $fromItemId, userIdentity: $userIdentity})
			MATCH (to:MemoryItem {itemId: $toItemId, userIdentity: $userIdentity})
			MERGE (from)-[r:${label} {relationshipId: $relationshipId}]->(to)
			ON CREATE SET r.userIdentity = $userIdentity, r.confidence = $confidence, r.description = $description, r.createdAt = $createdAt, r.type = $type
		`;

		try {
			await session.executeWrite((tx) => {
				switch (rel.type) {
					case "uses":
						return tx.run(queryFor("USES"), params);
					case "depends_on":
						return tx.run(queryFor("DEPENDS_ON"), params);
					case "decided_to":
						return tx.run(queryFor("DECIDED_TO"), params);
					case "supersedes":
						return tx.run(queryFor("SUPERSEDES"), params);
					case "part_of":
						return tx.run(queryFor("PART_OF"), params);
					case "contradicts":
						return tx.run(queryFor("CONTRADICTS"), params);
					case "clarifies":
						return tx.run(queryFor("CLARIFIES"), params);
				}
			});
		} finally {
			await session.close();
		}
	}

	// -------------------------------------------------------------------------
	// retrieve
	// -------------------------------------------------------------------------

	async retrieve(
		userIdentity: string,
		query: string,
		limit = 8,
	): Promise<MemoryItem[]> {
		const session = this.driver.session();
		const t0 = Date.now();
		try {
			const q = sanitizeFtsQuery(query);
			if (!q) return [];

			const result = await session.executeRead((tx) =>
				tx.run(
					`
					CALL db.index.fulltext.queryNodes('memoryItemDesc', $q)
					YIELD node, score
					WHERE node.userIdentity = $userIdentity AND node.validUntil IS NULL
					WITH node, score
					OPTIONAL MATCH (node)-[*1..2]-(related:MemoryItem {userIdentity: $userIdentity})
					WHERE related.validUntil IS NULL
					WITH collect(DISTINCT node) + collect(DISTINCT related) AS allNodes
					UNWIND allNodes AS m
					WITH m WHERE m IS NOT NULL AND m.userIdentity = $userIdentity AND m.validUntil IS NULL
					RETURN DISTINCT m.itemId AS itemId, m.userIdentity AS userIdentity, m.type AS type,
					  m.description AS description, m.sourceConversationId AS sourceConversationId,
					  m.validFrom AS validFrom, m.validUntil AS validUntil, m.accessCount AS accessCount,
					  m.lastAccessedAt AS lastAccessedAt, m.createdAt AS createdAt, m.redacted AS redacted
					LIMIT $limit
					`,
					{ q, userIdentity, limit: int(limit) },
				),
			);

			const items = result.records.map(mapMemoryItem);

			this.log.info("[memory] retrieve", {
				userIdentity,
				durationMs: Date.now() - t0,
				count: items.length,
			});

			// Fire-and-forget: bump access counters
			if (items.length > 0) {
				const itemIds = items.map((i) => i.itemId);
				const bumpSession = this.driver.session();
				void bumpSession
					.executeWrite((tx) =>
						tx.run(
							`
							UNWIND $itemIds AS id
							MATCH (m:MemoryItem {itemId: id})
							SET m.accessCount = coalesce(m.accessCount, 0) + 1, m.lastAccessedAt = datetime()
							`,
							{ itemIds },
						),
					)
					.finally(() => bumpSession.close())
					.catch((err) =>
						this.log.warn("[memory] access bump failed", { err }),
					);
			}

			return items;
		} finally {
			await session.close();
		}
	}

	// -------------------------------------------------------------------------
	// viewProfile
	// -------------------------------------------------------------------------

	async viewProfile(userIdentity: string): Promise<{
		profile: UserProfile | null;
		itemCount: number;
		recentItems: MemoryItem[];
	}> {
		const session = this.driver.session();
		try {
			// Run sequentially on a single session — Neo4j sessions are not safe for concurrent use.
			const profileResult = await session.executeRead((tx) =>
				tx.run(
					`
					OPTIONAL MATCH (p:UserProfile {userIdentity: $userIdentity})
					RETURN p.userIdentity AS userIdentity, p.displayName AS displayName, p.preferences AS preferences, p.updatedAt AS updatedAt
					`,
					{ userIdentity },
				),
			);
			const countResult = await session.executeRead((tx) =>
				tx.run(
					`
					MATCH (m:MemoryItem)-[:OWNED_BY]->(u:UserIdentity {userIdentity: $userIdentity})
					WHERE m.validUntil IS NULL
					RETURN count(m) AS itemCount
					`,
					{ userIdentity },
				),
			);
			const itemsResult = await session.executeRead((tx) =>
				tx.run(
					`
					MATCH (m:MemoryItem)-[:OWNED_BY]->(u:UserIdentity {userIdentity: $userIdentity})
					WHERE m.validUntil IS NULL
					RETURN m.itemId AS itemId, m.userIdentity AS userIdentity, m.type AS type,
					  m.description AS description, m.sourceConversationId AS sourceConversationId,
					  m.validFrom AS validFrom, m.validUntil AS validUntil, m.accessCount AS accessCount,
					  m.lastAccessedAt AS lastAccessedAt, m.createdAt AS createdAt, m.redacted AS redacted
					ORDER BY m.createdAt DESC LIMIT 20
					`,
					{ userIdentity },
				),
			);

			let profile: UserProfile | null = null;
			const pr = profileResult.records[0];
			if (pr && pr.get("userIdentity") != null) {
				const rawPrefs = pr.get("preferences");
				const preferences = rawPrefs
					? (JSON.parse(rawPrefs as string) as Record<string, unknown>)
					: {};
				profile = {
					userIdentity: pr.get("userIdentity") as string,
					displayName: (pr.get("displayName") as string | null) ?? null,
					preferences,
					updatedAt: toDateOrNull(pr.get("updatedAt")) ?? new Date(0),
				};
			}

			const itemCount = toNum(countResult.records[0]?.get("itemCount") ?? 0);
			const recentItems = itemsResult.records.map(mapMemoryItem);

			return { profile, itemCount, recentItems };
		} finally {
			await session.close();
		}
	}

	// -------------------------------------------------------------------------
	// exportAll
	// -------------------------------------------------------------------------

	async exportAll(userIdentity: string): Promise<string> {
		const session = this.driver.session();
		try {
			const itemsResult = await session.executeRead((tx) =>
				tx.run(
					`
					MATCH (m:MemoryItem)-[:OWNED_BY]->(u:UserIdentity {userIdentity: $userIdentity})
					RETURN m.itemId AS itemId, m.type AS type, m.description AS description,
					  m.validFrom AS validFrom, m.validUntil AS validUntil, m.createdAt AS createdAt
					ORDER BY m.createdAt DESC
					`,
					{ userIdentity },
				),
			);
			const convResult = await session.executeRead((tx) =>
				tx.run(
					`
					MATCH (c:ConversationRecord {userIdentity: $userIdentity})
					RETURN c.conversationId AS conversationId, c.startedAt AS startedAt, c.channel AS channel
					ORDER BY c.startedAt DESC
					`,
					{ userIdentity },
				),
			);

			const itemLines = itemsResult.records
				.map((r) => {
					const type = r.get("type") as string;
					const desc = r.get("description") as string;
					const since = (toDateOrNull(r.get("validFrom")) ?? new Date(0))
						.toISOString()
						.split("T")[0];
					const superseded = r.get("validUntil")
						? ` → superseded ${(toDateOrNull(r.get("validUntil")) ?? new Date(0)).toISOString().split("T")[0]}`
						: "";
					return `- [${type}] ${desc} (since ${since}${superseded})`;
				})
				.join("\n");

			const convLines = convResult.records
				.map((r) => {
					const convId = r.get("conversationId") as string;
					const channel = r.get("channel") as string;
					const startedAt = (
						toDateOrNull(r.get("startedAt")) ?? new Date(0)
					).toISOString();
					return `- ${convId} on ${channel} at ${startedAt}`;
				})
				.join("\n");

			return [
				`# Memory Export for User ${userIdentity}`,
				"",
				"## Memory Items",
				itemLines || "_No memory items found._",
				"",
				"## Conversation Records",
				convLines || "_No conversation records found._",
			].join("\n");
		} finally {
			await session.close();
		}
	}

	// -------------------------------------------------------------------------
	// forgetItem
	// -------------------------------------------------------------------------

	async forgetItem(
		userIdentity: string,
		itemId: string,
	): Promise<{ ok: boolean }> {
		const session = this.driver.session();
		try {
			const result = await session.executeWrite((tx) =>
				tx.run(
					`
					MATCH (m:MemoryItem {itemId: $itemId, userIdentity: $userIdentity})
					WHERE m.validUntil IS NULL
					SET m.validUntil = datetime()
					RETURN m.itemId AS itemId
					`,
					{ itemId, userIdentity },
				),
			);
			return { ok: result.records.length > 0 };
		} finally {
			await session.close();
		}
	}

	// -------------------------------------------------------------------------
	// eraseAll
	// -------------------------------------------------------------------------

	async eraseAll(
		userIdentity: string,
	): Promise<{ deletedItems: number; deletedRecords: number }> {
		const session = this.driver.session();
		try {
			const itemsResult = await session.executeWrite((tx) =>
				tx.run(
					`
					MATCH (m:MemoryItem)-[:OWNED_BY]->(:UserIdentity {userIdentity: $userIdentity})
					DETACH DELETE m
					RETURN count(m) AS deleted
					`,
					{ userIdentity },
				),
			);

			const recsResult = await session.executeWrite((tx) =>
				tx.run(
					`
					MATCH (c:ConversationRecord {userIdentity: $userIdentity})
					DETACH DELETE c
					RETURN count(c) AS deleted
					`,
					{ userIdentity },
				),
			);

			await session.executeWrite((tx) =>
				tx.run(
					`
					OPTIONAL MATCH (p:UserProfile {userIdentity: $userIdentity})
					DETACH DELETE p
					`,
					{ userIdentity },
				),
			);

			await session.executeWrite((tx) =>
				tx.run(
					`
					MATCH (p:PairingCode {userIdentity: $userIdentity})
					DETACH DELETE p
					`,
					{ userIdentity },
				),
			);

			await session.executeWrite((tx) =>
				tx.run(
					`
					MATCH (cim:ChannelIdentityMapping {userIdentity: $userIdentity})
					DETACH DELETE cim
					`,
					{ userIdentity },
				),
			);

			await session.executeWrite((tx) =>
				tx.run(
					`
					MATCH (r:ConsolidationReport {userIdentity: $userIdentity})
					DETACH DELETE r
					`,
					{ userIdentity },
				),
			);

			await session.executeWrite((tx) =>
				tx.run(
					`
					OPTIONAL MATCH (u:UserIdentity {userIdentity: $userIdentity})
					DETACH DELETE u
					`,
					{ userIdentity },
				),
			);

			return {
				deletedItems: toNum(itemsResult.records[0]?.get("deleted") ?? 0),
				deletedRecords: toNum(recsResult.records[0]?.get("deleted") ?? 0),
			};
		} finally {
			await session.close();
		}
	}

	// -------------------------------------------------------------------------
	// attribute
	// -------------------------------------------------------------------------

	async attribute(
		userIdentity: string,
		itemId: string,
	): Promise<{
		item: MemoryItem;
		sourceConversation: {
			conversationId: string;
			channel: string;
			startedAt: Date;
		};
	} | null> {
		const session = this.driver.session();
		try {
			const result = await session.executeRead((tx) =>
				tx.run(
					`
					MATCH (m:MemoryItem {itemId: $itemId, userIdentity: $userIdentity})
					MATCH (c:ConversationRecord {userIdentity: $userIdentity, conversationId: m.sourceConversationId})
					RETURN m.itemId AS itemId, m.userIdentity AS userIdentity, m.type AS type,
					  m.description AS description, m.sourceConversationId AS sourceConversationId,
					  m.validFrom AS validFrom, m.validUntil AS validUntil, m.accessCount AS accessCount,
					  m.lastAccessedAt AS lastAccessedAt, m.createdAt AS createdAt, m.redacted AS redacted,
					  c.conversationId AS conversationId, c.channel AS channel, c.startedAt AS startedAt
					`,
					{ itemId, userIdentity },
				),
			);

			if (result.records.length === 0) return null;

			const r = result.records[0];
			return {
				item: mapMemoryItem(r),
				sourceConversation: {
					conversationId: r.get("conversationId") as string,
					channel: r.get("channel") as string,
					startedAt: toDateOrNull(r.get("startedAt")) ?? new Date(0),
				},
			};
		} finally {
			await session.close();
		}
	}

	// -------------------------------------------------------------------------
	// listConsolidationReports
	// -------------------------------------------------------------------------

	async listConsolidationReports(
		userIdentity: string,
		limit = 5,
	): Promise<ConsolidationReport[]> {
		const session = this.driver.session();
		try {
			const result = await session.executeRead((tx) =>
				tx.run(
					`
					MATCH (r:ConsolidationReport {userIdentity: $userIdentity})
					RETURN r.reportId AS reportId, r.userIdentity AS userIdentity, r.ranAt AS ranAt,
					  r.merged AS merged, r.pruned AS pruned, r.supersessionsRecorded AS supersessionsRecorded,
					  r.contradictionsDetected AS contradictionsDetected, r.summary AS summary
					ORDER BY r.ranAt DESC LIMIT $limit
					`,
					{ userIdentity, limit: int(limit) },
				),
			);

			return result.records.map((r) => ({
				reportId: r.get("reportId") as string,
				userIdentity: r.get("userIdentity") as string,
				ranAt: toDate(r.get("ranAt")),
				merged: toNum(r.get("merged")),
				pruned: toNum(r.get("pruned")),
				supersessionsRecorded: toNum(r.get("supersessionsRecorded")),
				contradictionsDetected: JSON.parse(
					(r.get("contradictionsDetected") as string) || "[]",
				) as ConsolidationReport["contradictionsDetected"],
				summary: r.get("summary") as string,
			}));
		} finally {
			await session.close();
		}
	}
}
