import type { MemoryStore } from "../ports/memory-store.js";
import type { MemoryItem } from "../schema.js";

export async function buildMarkdownExport(
	userIdentity: string,
	memoryStore: MemoryStore,
): Promise<string> {
	return memoryStore.exportAll(userIdentity);
}

export function formatMemoryItemsAsMarkdown(items: MemoryItem[]): string {
	if (items.length === 0) {
		return "_No memory items found._\n";
	}

	const byType = new Map<string, MemoryItem[]>();
	for (const item of items) {
		const list = byType.get(item.type) ?? [];
		list.push(item);
		byType.set(item.type, list);
	}

	const sections: string[] = [];
	for (const [type, typeItems] of byType) {
		sections.push(`### ${type.charAt(0).toUpperCase() + type.slice(1)}s\n`);
		for (const item of typeItems) {
			const since = item.validFrom.toISOString().split("T")[0];
			const status = item.validUntil
				? ` _(superseded ${item.validUntil.toISOString().split("T")[0]})_`
				: "";
			sections.push(`- ${item.description} _(since ${since})_${status}`);
		}
		sections.push("");
	}

	return sections.join("\n");
}
