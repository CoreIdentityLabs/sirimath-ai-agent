import type { MemoryStore } from "../ports/memory-store.js";

export async function eraseWithConfirmation(
	userIdentity: string,
	confirm: boolean,
	phrase: string | undefined,
	memoryStore: MemoryStore,
): Promise<
	| { ok: true; deletedItems: number; deletedRecords: number }
	| { ok: false; message: string }
> {
	if (!confirm || phrase?.trim().toLowerCase() !== "erase my memory") {
		return {
			ok: false,
			message:
				'This will permanently erase everything I remember about you. To confirm, reply with the exact phrase: "erase my memory".',
		};
	}

	const result = await memoryStore.eraseAll(userIdentity);
	return { ok: true, ...result };
}
