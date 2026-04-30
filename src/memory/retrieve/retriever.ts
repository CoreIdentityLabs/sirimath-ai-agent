import { type Driver, isInt } from "neo4j-driver";
import type { MemoryStore } from "../ports/memory-store.js";
import type { MemoryItem } from "../schema.js";

interface AnyRecord {
	get(key: string): unknown;
}

function toDate(val: unknown): Date {
	if (val && typeof val === "object" && "toString" in val)
		return new Date((val as { toString(): string }).toString());
	return new Date(val as string);
}

function toDateOrNull(val: unknown): Date | null {
	if (!val) return null;
	return toDate(val);
}

function toNum(val: unknown): number {
	if (isInt(val as Parameters<typeof isInt>[0]))
		return (val as { toNumber(): number }).toNumber();
	return Number(val ?? 0);
}

function mapMemoryItem(rec: AnyRecord): MemoryItem {
	return {
		itemId: rec.get("itemId") as string,
		userIdentity: rec.get("userIdentity") as string,
		type: rec.get("type") as MemoryItem["type"],
		description: rec.get("description") as string,
		validFrom: toDate(rec.get("validFrom")),
		validUntil: toDateOrNull(rec.get("validUntil")),
		sourceConversationId:
			(rec.get("sourceConversationId") as string | null) ?? "",
		redacted: Boolean(rec.get("redacted")),
		accessCount: toNum(rec.get("accessCount")),
		lastAccessedAt: toDateOrNull(rec.get("lastAccessedAt")),
		createdAt: toDate(rec.get("createdAt")),
	};
}

function sanitizeFtsQuery(q: string): string {
	return q.replace(/[+\-!(){}\[\]^"~*?:\\\/]/g, " ").trim() || "*";
}

export function createNeo4jRetriever(driver: Driver) {
	return async function retrieve(
		userIdentity: string,
		query: string,
		limit = 12,
	): Promise<MemoryItem[]> {
		const session = driver.session({ defaultAccessMode: "READ" });
		try {
			const res = await session.executeRead((tx) =>
				tx.run(
					`
					CALL db.index.fulltext.queryNodes('memoryItemDesc', $q) YIELD node, score
					WHERE node.userIdentity = $u AND node.redacted = false AND node.validUntil IS NULL
					WITH node, score
					ORDER BY score DESC
					LIMIT 24
					MATCH (node)-[*0..2]-(related:MemoryItem {userIdentity: $u})
					WHERE related.redacted = false AND related.validUntil IS NULL
					RETURN DISTINCT
					  related.itemId           AS itemId,
					  related.userIdentity     AS userIdentity,
					  related.type             AS type,
					  related.description      AS description,
					  related.validFrom        AS validFrom,
					  related.validUntil       AS validUntil,
					  related.sourceConversationId AS sourceConversationId,
					  related.redacted         AS redacted,
					  related.accessCount      AS accessCount,
					  related.lastAccessedAt   AS lastAccessedAt,
					  related.createdAt        AS createdAt,
					  max(score)               AS score
					ORDER BY score DESC
					LIMIT $limit
					`,
					{ u: userIdentity, q: sanitizeFtsQuery(query), limit },
				),
			);

			const ids = res.records.map((r) => r.get("itemId") as string);
			if (ids.length) {
				void session.executeWrite((tx) =>
					tx.run(
						`
						UNWIND $ids AS id
						MATCH (m:MemoryItem {itemId: id})
						SET m.accessCount = coalesce(m.accessCount, 0) + 1,
						    m.lastAccessedAt = datetime()
						`,
						{ ids },
					),
				);
			}

			return res.records.map(mapMemoryItem);
		} finally {
			await session.close();
		}
	};
}

/** Standalone retrieve function for use in MemoryStore implementations. */
export async function retrieve(
	driver: Driver,
	userIdentity: string,
	query: string,
	limit = 12,
): Promise<MemoryItem[]> {
	return createNeo4jRetriever(driver)(userIdentity, query, limit);
}
