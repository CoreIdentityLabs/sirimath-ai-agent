import { createTool } from "@voltagent/core";
import { z } from "zod";
import { clampResults, clampSnippet, clampText } from "./shared/tool-output.js";

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

interface SearchResultItem {
	title: string;
	url: string;
	snippet: string;
	score?: number;
}

function buildGoogleSearchUrl(query: string): string {
	return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function formatResults(results: SearchResultItem[]): string {
	return results
		.map(
			(result, index) =>
				`${index + 1}. **${result.title}**\n   ${result.url}\n   ${result.snippet}`,
		)
		.join("\n\n");
}

async function braveSearch(
	query: string,
	count: number,
): Promise<SearchResultItem[]> {
	const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
	const res = await fetch(url, {
		headers: {
			Accept: "application/json",
			"Accept-Encoding": "gzip",
			"X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY ?? "",
		},
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) throw new Error(`Brave Search API error: ${res.status}`);
	const data = (await res.json()) as { web?: { results?: BraveWebResult[] } };
	return (data.web?.results ?? []).map((result) => ({
		title: result.title,
		url: result.url,
		snippet: clampSnippet(result.description ?? "", 180),
	}));
}

async function tavilySearch(
	query: string,
	count: number,
): Promise<{ answer?: string; results: SearchResultItem[] }> {
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
	const data = (await res.json()) as {
		answer?: string;
		results?: TavilyResult[];
	};
	return {
		answer: data.answer,
		results: (data.results ?? []).map((result) => ({
			title: result.title,
			url: result.url,
			snippet: clampSnippet(result.content, 180),
			score: result.score,
		})),
	};
}

// Only export if a search API key is configured
const hasBrave = Boolean(process.env.BRAVE_SEARCH_API_KEY);
const hasTavily = Boolean(process.env.TAVILY_API_KEY);

export const webSearchTool = createTool({
	name: "webSearch",
	description:
		"Search the internet for current information and return 5 to 10 links that can be passed to fetchUrl for deeper reading. Use for news, facts, and research tasks that need up-to-date sources.",
	parameters: z.object({
		query: z.string().min(1).describe("The search query"),
		count: z
			.number()
			.int()
			.min(1)
			.max(10)
			.default(5)
			.describe(
				"Number of results (1-10). Prefer 5-10 when you plan to inspect result pages with fetchUrl.",
			),
	}),
	execute: async ({ query, count }) => {
		const searchUrl = buildGoogleSearchUrl(query);

		if (hasBrave) {
			const results = clampResults(await braveSearch(query, count), 5);
			return {
				provider: "brave",
				query,
				searchUrl,
				resultsSummary: clampText(formatResults(results), 1_200),
				links: results.map((result) => result.url),
				results: results.map((result, index) => ({
					rank: index + 1,
					title: result.title,
					url: result.url,
					snippet: result.snippet,
				})),
				nextAction:
					"Use fetchUrl only on the 1 to 3 most relevant links from the links array to extract deeper details.",
			};
		}

		if (hasTavily) {
			const { answer, results } = await tavilySearch(query, count);
			const limitedResults = clampResults(results, 5);
			const resultsSummary = [
				answer ? `**Summary**: ${clampText(answer, 300)}` : "",
				formatResults(limitedResults),
			]
				.filter(Boolean)
				.join("\n\n");

			return {
				provider: "tavily",
				query,
				searchUrl,
				resultsSummary: clampText(resultsSummary, 1_200),
				links: limitedResults.map((result) => result.url),
				results: limitedResults.map((result, index) => ({
					rank: index + 1,
					title: result.title,
					url: result.url,
					snippet: result.snippet,
					score: result.score,
				})),
				nextAction:
					"Use fetchUrl only on the 1 to 3 most relevant links from the links array to extract deeper details.",
			};
		}

		return {
			query,
			searchUrl,
			resultsSummary:
				"Web search is not configured. Set BRAVE_SEARCH_API_KEY or TAVILY_API_KEY in your environment.",
			provider: "none",
			links: [],
			results: [],
			nextAction:
				"Configure BRAVE_SEARCH_API_KEY or TAVILY_API_KEY so webSearch can return links for fetchUrl.",
		};
	},
});

export const webSearchEnabled = hasBrave || hasTavily;
