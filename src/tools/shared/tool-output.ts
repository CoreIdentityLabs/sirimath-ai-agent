const DEFAULT_MAX_TEXT_CHARS = 2_000;
const DEFAULT_MAX_SNIPPET_CHARS = 240;
const DEFAULT_MAX_RESULTS = 5;

export function clampText(
	text: string,
	maxChars = DEFAULT_MAX_TEXT_CHARS,
): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars).trimEnd()}...[truncated]`;
}

export function clampSnippet(
	text: string,
	maxChars = DEFAULT_MAX_SNIPPET_CHARS,
): string {
	return clampText(text.replace(/\s+/g, " ").trim(), maxChars);
}

export function clampResults<T>(
	results: T[],
	maxResults = DEFAULT_MAX_RESULTS,
): T[] {
	return results.slice(0, maxResults);
}
