import { createTool } from "@voltagent/core";
import { z } from "zod";

interface BraveWebResult {
	title: string;
	url: string;
	description?: string;
}

interface TavilyResult {
	title: string;
	url: string;
	content: string;
	score?: number;
}

async function braveSearch(query: string, count: number): Promise<string> {
	const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
	const res = await fetch(url, {
		headers: {
			Accept: "application/json",
			"Accept-Encoding": "gzip",
			"X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!,
		},
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) throw new Error(`Brave Search API error: ${res.status}`);
	const data = (await res.json()) as { web?: { results?: BraveWebResult[] } };
	const results = data.web?.results ?? [];
	return results
		.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description ?? ""}`)
		.join("\n\n");
}

async function tavilySearch(query: string, count: number): Promise<string> {
	const res = await fetch("https://api.tavily.com/search", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			api_key: process.env.TAVILY_API_KEY,
			query,
			max_results: count,
			include_answer: true,
		}),
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) throw new Error(`Tavily API error: ${res.status}`);
	const data = (await res.json()) as { answer?: string; results?: TavilyResult[] };
	const lines: string[] = [];
	if (data.answer) lines.push(`**Summary**: ${data.answer}\n`);
	for (const [i, r] of (data.results ?? []).entries()) {
		lines.push(`${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content.slice(0, 300)}`);
	}
	return lines.join("\n\n");
}

// Only export if a search API key is configured
const hasBrave = Boolean(process.env.BRAVE_SEARCH_API_KEY);
const hasTavily = Boolean(process.env.TAVILY_API_KEY);

export const webSearchTool = createTool({
	name: "webSearch",
	description:
		"Search the internet for current information. Returns top results with titles, URLs, and snippets. Use for news, facts, or anything needing up-to-date data.",
	parameters: z.object({
		query: z.string().min(1).describe("The search query"),
		count: z.number().int().min(1).max(10).default(5).describe("Number of results (1–10)"),
	}),
	execute: async ({ query, count }) => {
		if (hasBrave) return { results: await braveSearch(query, count), provider: "brave" };
		if (hasTavily) return { results: await tavilySearch(query, count), provider: "tavily" };
		return {
			results:
				"Web search is not configured. Set BRAVE_SEARCH_API_KEY or TAVILY_API_KEY in your environment.",
			provider: "none",
		};
	},
});

export const webSearchEnabled = hasBrave || hasTavily;
