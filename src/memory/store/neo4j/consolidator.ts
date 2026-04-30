import type { Logger } from "@voltagent/logger";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { isInt } from "neo4j-driver";
import type { Driver } from "neo4j-driver";
import { ulid as generateUlid } from "ulid";
import { z } from "zod";
import type { Consolidator } from "../../ports/consolidator.js";
import type { ConsolidationReport } from "../../schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFts(q: string): string {
	return q
		.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

function toNum(val: unknown): number {
	if (val == null) return 0;
	if (isInt(val)) return (val as { toNumber(): number }).toNumber();
	if (typeof val === "number") return val;
	return Number(val);
}

// ---------------------------------------------------------------------------
// LLM schemas
// ---------------------------------------------------------------------------

const DuplicatePairsSchema = z.object({
	pairs: z.array(
		z.object({
			keepId: z.string(),
			removeId: z.string(),
			reason: z.string().max(256),
		}),
	),
});

const ContradictionPairsSchema = z.object({
	pairs: z.array(
		z.object({
			itemIdA: z.string(),
			itemIdB: z.string(),
			reason: z.string().max(256),
		}),
	),
});

// ---------------------------------------------------------------------------
// Neo4jConsolidator
// ---------------------------------------------------------------------------

type ClusterItem = { itemId: string; type: string; description: string };

export class Neo4jConsolidator implements Consolidator {
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly driver: Driver,
		private readonly model: LanguageModel,
		private readonly log: Logger,
	) {}

	async runOnce(userIdentity: string): Promise<ConsolidationReport> {
		const reportId = generateUlid();
		let merged = 0;
		let pruned = 0;
		let supersessionsRecorded = 0;
		const contradictionsDetected: ConsolidationReport["contradictionsDetected"] =
			[];

		// -----------------------------------------------------------------------
		// Pass 1: Seed — FTS over recent items to surface candidate topics
		// -----------------------------------------------------------------------
		let seedIds: string[] = [];
		try {
			const s = this.driver.session();
			try {
				const recentResult = await s.executeRead((tx) =>
					tx.run(
						`MATCH (m:MemoryItem {userIdentity: $u})
             WHERE m.validUntil IS NULL
             RETURN m.description AS description
             ORDER BY m.createdAt DESC LIMIT 10`,
						{ u: userIdentity },
					),
				);

				const keywords = recentResult.records
					.flatMap((r) =>
						sanitizeFts(r.get("description") as string)
							.split(" ")
							.slice(0, 4),
					)
					.filter(Boolean)
					.slice(0, 24)
					.join(" ");

				if (keywords.length > 0) {
					const ftsResult = await s.executeRead((tx) =>
						tx.run(
							`CALL db.index.fulltext.queryNodes('memoryItemDesc', $q) YIELD node, score
               WHERE node.userIdentity = $u AND node.validUntil IS NULL
               RETURN node.itemId AS itemId LIMIT 20`,
							{ q: keywords, u: userIdentity },
						),
					);
					seedIds = ftsResult.records.map((r) => r.get("itemId") as string);
				}
			} finally {
				await s.close();
			}
		} catch (err) {
			this.log.warn("[consolidator] pass1 seed failed", { err });
		}

		// -----------------------------------------------------------------------
		// Pass 2: BFS expansion — 2-hop traversal from each seed
		// -----------------------------------------------------------------------
		let clusterItems: ClusterItem[] = [];
		if (seedIds.length > 0) {
			try {
				const s = this.driver.session();
				try {
					const bfsResult = await s.executeRead((tx) =>
						tx.run(
							`UNWIND $seedIds AS seedId
               MATCH (seed:MemoryItem {itemId: seedId})
               OPTIONAL MATCH (seed)-[*1..2]-(n:MemoryItem {userIdentity: $u})
               WHERE n.validUntil IS NULL
               WITH collect(DISTINCT seed) + collect(DISTINCT n) AS allNodes
               UNWIND allNodes AS m
               WHERE m IS NOT NULL AND m.validUntil IS NULL
               RETURN DISTINCT m.itemId AS itemId, m.type AS type, m.description AS description`,
							{ seedIds, u: userIdentity },
						),
					);
					clusterItems = bfsResult.records.map((r) => ({
						itemId: r.get("itemId") as string,
						type: r.get("type") as string,
						description: r.get("description") as string,
					}));
				} finally {
					await s.close();
				}
			} catch (err) {
				this.log.warn("[consolidator] pass2 bfs failed", { err });
			}
		}

		// Group cluster items by type for duplicate merging + contradiction passes
		const byType = new Map<string, ClusterItem[]>();
		for (const item of clusterItems) {
			if (!byType.has(item.type)) byType.set(item.type, []);
			byType.get(item.type)?.push(item);
		}

		// -----------------------------------------------------------------------
		// Pass 3: Centrality — identify hub items (high degree), never prune
		// -----------------------------------------------------------------------
		let hubIds = new Set<string>();
		try {
			const s = this.driver.session();
			try {
				const hubResult = await s.executeRead((tx) =>
					tx.run(
						`MATCH (m:MemoryItem {userIdentity: $u})
             WHERE m.validUntil IS NULL
             OPTIONAL MATCH (m)-[r]-()
             WITH m, count(r) AS degree
             WHERE degree >= 3
             RETURN m.itemId AS itemId ORDER BY degree DESC LIMIT 50`,
						{ u: userIdentity },
					),
				);
				hubIds = new Set(
					hubResult.records.map((r) => r.get("itemId") as string),
				);
			} finally {
				await s.close();
			}
		} catch (err) {
			this.log.warn("[consolidator] pass3 centrality failed", { err });
		}

		// -----------------------------------------------------------------------
		// Duplicate merging — LLM pairwise judgment over same-type clusters
		// -----------------------------------------------------------------------
		if (clusterItems.length >= 2) {
			for (const [, items] of byType) {
				if (items.length < 2) continue;
				try {
					const { object } = await generateObject({
						model: this.model,
						schema: DuplicatePairsSchema,
						prompt: [
							"You are a memory deduplication assistant.",
							"Given these memory items of the same type, identify pairs that express the same fact or concept.",
							"For each duplicate pair, set keepId to the newer item (higher ULID = more recent) and removeId to the older.",
							"Return empty pairs array if no duplicates found.\n",
							"Items:",
							...items.map(
								(i) => `- id: ${i.itemId}\n  description: ${i.description}`,
							),
						].join("\n"),
					});

					for (const pair of object.pairs) {
						if (hubIds.has(pair.removeId)) continue; // never supersede hub items
						const s = this.driver.session();
						try {
							await s.executeWrite((tx) =>
								tx.run(
									`MATCH (old:MemoryItem {itemId: $removeId, userIdentity: $u})
                   WHERE old.validUntil IS NULL
                   SET old.validUntil = datetime()
                   WITH old
                   MATCH (new:MemoryItem {itemId: $keepId, userIdentity: $u})
                   MERGE (new)-[r:SUPERSEDES {relationshipId: $relId}]->(old)
                   ON CREATE SET r.userIdentity = $u, r.confidence = 1.0,
                     r.description = $reason, r.createdAt = datetime(), r.type = 'supersedes'`,
									{
										removeId: pair.removeId,
										keepId: pair.keepId,
										relId: generateUlid(),
										u: userIdentity,
										reason: pair.reason,
									},
								),
							);
							merged++;
							supersessionsRecorded++;
						} catch (writeErr) {
							this.log.warn("[consolidator] merge write failed", {
								writeErr,
								pair,
							});
						} finally {
							await s.close();
						}
					}
				} catch (llmErr) {
					this.log.warn("[consolidator] LLM duplicate detection failed", {
						llmErr,
					});
				}
			}
		}

		// -----------------------------------------------------------------------
		// Pass 4: Temporal stale-prune
		// Items where lastAccessedAt < (now - 90d) and type != 'decision'
		// Hub items are excluded. Sets validUntil (soft-delete, per FR-015).
		// -----------------------------------------------------------------------
		const hubIdsList = [...hubIds];
		try {
			const s = this.driver.session();
			try {
				const pruneResult = await s.executeWrite((tx) =>
					tx.run(
						`MATCH (m:MemoryItem {userIdentity: $u})
             WHERE m.validUntil IS NULL
               AND m.type <> 'decision'
               AND m.lastAccessedAt IS NOT NULL
               AND m.lastAccessedAt < datetime() - duration('P90D')
               AND NOT m.itemId IN $hubIds
             SET m.validUntil = datetime()
             RETURN count(m) AS pruned`,
						{ u: userIdentity, hubIds: hubIdsList },
					),
				);
				pruned = toNum(pruneResult.records[0]?.get("pruned") ?? 0);
			} finally {
				await s.close();
			}
		} catch (err) {
			this.log.warn("[consolidator] pass4 stale-prune failed", { err });
		}

		// -----------------------------------------------------------------------
		// Pass 5: Contradiction scan — LLM pairwise judgment over same-type clusters
		// -----------------------------------------------------------------------
		if (clusterItems.length >= 2) {
			for (const [, items] of byType) {
				if (items.length < 2) continue;
				try {
					const { object } = await generateObject({
						model: this.model,
						schema: ContradictionPairsSchema,
						prompt: [
							"You are a memory consistency checker.",
							"Given these memory items of the same type, identify pairs that directly contradict each other.",
							"A contradiction means one item claims something incompatible with another.",
							"Return empty pairs array if no contradictions found.\n",
							"Items:",
							...items.map(
								(i) => `- id: ${i.itemId}\n  description: ${i.description}`,
							),
						].join("\n"),
					});

					for (const pair of object.pairs) {
						contradictionsDetected.push({
							itemIdA: pair.itemIdA,
							itemIdB: pair.itemIdB,
							reason: pair.reason,
							resolved: false,
						});
					}
				} catch (llmErr) {
					this.log.warn("[consolidator] LLM contradiction detection failed", {
						llmErr,
					});
				}
			}
		}

		// -----------------------------------------------------------------------
		// Build summary & persist ConsolidationReport node
		// -----------------------------------------------------------------------
		const summary = [
			`Consolidated memory for ${userIdentity}.`,
			`Merged ${merged} duplicate(s), pruned ${pruned} stale item(s),`,
			`recorded ${supersessionsRecorded} supersession(s),`,
			`detected ${contradictionsDetected.length} contradiction(s).`,
		].join(" ");

		const s = this.driver.session();
		try {
			await s.executeWrite((tx) =>
				tx.run(
					`CREATE (r:ConsolidationReport {
             reportId: $reportId,
             userIdentity: $userIdentity,
             ranAt: datetime(),
             summary: $summary,
             merged: $merged,
             pruned: $pruned,
             supersessionsRecorded: $supersessionsRecorded,
             contradictionsDetected: $contradictionsDetected
           })`,
					{
						reportId,
						userIdentity,
						summary,
						merged,
						pruned,
						supersessionsRecorded,
						contradictionsDetected: JSON.stringify(contradictionsDetected),
					},
				),
			);
		} catch (err) {
			this.log.warn("[consolidator] report persist failed", { err });
		} finally {
			await s.close();
		}

		const report: ConsolidationReport = {
			reportId,
			userIdentity,
			ranAt: new Date(),
			summary,
			merged,
			pruned,
			supersessionsRecorded,
			contradictionsDetected,
		};

		this.log.info("[consolidator] runOnce complete", {
			reportId,
			userIdentity,
			merged,
			pruned,
			contradictions: contradictionsDetected.length,
		});

		return report;
	}

	// -------------------------------------------------------------------------
	// runForAllUsers
	// -------------------------------------------------------------------------

	async runForAllUsers(): Promise<void> {
		let userIds: string[] = [];
		const s = this.driver.session();
		try {
			const result = await s.executeRead((tx) =>
				tx.run("MATCH (u:UserIdentity) RETURN u.userIdentity AS uid"),
			);
			userIds = result.records.map((r) => r.get("uid") as string);
		} finally {
			await s.close();
		}

		for (const uid of userIds) {
			try {
				await this.runOnce(uid);
			} catch (err) {
				this.log.error("[consolidator] runOnce failed for user", { err, uid });
			}
		}
	}

	// -------------------------------------------------------------------------
	// startScheduled / stopScheduled
	// -------------------------------------------------------------------------

	startScheduled(): void {
		if (this.timer) return;
		const intervalMs = 24 * 60 * 60 * 1000;
		this.timer = setInterval(() => {
			void this.runForAllUsers().catch((err) =>
				this.log.error("[consolidator] scheduled run failed", { err }),
			);
		}, intervalMs);
	}

	stopScheduled(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createNeo4jConsolidator(
	driver: Driver,
	model: LanguageModel,
	log: Logger,
): Consolidator {
	return new Neo4jConsolidator(driver, model, log);
}
