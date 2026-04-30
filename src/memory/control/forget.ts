import type { MemoryStore } from "../ports/memory-store.js";
import type { MemoryItem } from "../schema.js";

export interface ForgetCandidate {
	itemId: string;
	type: string;
	description: string;
	knownSince: string;
}

export async function findCandidates(
	userIdentity: string,
	topic: string,
	memoryStore: MemoryStore,
	limit = 5,
): Promise<ForgetCandidate[]> {
	const items = await memoryStore.retrieve(userIdentity, topic, limit);
	return items.map((item: MemoryItem) => ({
		itemId: item.itemId,
		type: item.type,
		description: item.description,
		knownSince: item.validFrom.toISOString(),
	}));
}

export async function confirmForget(
	userIdentity: string,
	itemId: string,
	memoryStore: MemoryStore,
): Promise<{ ok: boolean; itemId: string }> {
	const result = await memoryStore.forgetItem(userIdentity, itemId);
	return { ok: result.ok, itemId };
}
