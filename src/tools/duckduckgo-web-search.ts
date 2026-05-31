import { createTool } from "@voltagent/core";
import { z } from "zod";

interface DuckDuckGoSearchResultItem {
	rank: number;
	title: string;
	url: string;
	snippet: string;
}

function buildDuckDuckGoSearchUrl(query: string): string {
	return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function decodeHtml(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function extractDuckDuckGoResults(
	html: string,
	count: number,
): DuckDuckGoSearchResultItem[] {
	const resultRegex =
		/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gim;
	const seen = new Set<string>();
	const results: DuckDuckGoSearchResultItem[] = [];

	for (const match of html.matchAll(resultRegex)) {
		const url = decodeHtml(match[1]);
		const title = decodeHtml(match[2]);
		const snippet = decodeHtml(match[3]);

		if (!url || !title || seen.has(url)) continue;

		seen.add(url);
		results.push({
			rank: results.length + 1,
			title,
			url,
			snippet,
		});

		if (results.length >= count) break;
	}

	return results;
}

function formatResults(results: DuckDuckGoSearchResultItem[]): string {
	return results
		.map(
			(result) =>
				`${result.rank}. **${result.title}**\n   ${result.url}${result.snippet ? `\n   ${result.snippet}` : ""}`,
		)
		.join("\n\n");
}

export const duckDuckGoWebSearchTool = createTool({
	name: "duckDuckGoWebSearch",
	description:
		"Search DuckDuckGo without requiring API keys and return 5 to 10 result links that can be passed to fetchUrl for deeper reading.",
	parameters: z.object({
		query: z.string().min(1).describe("The search query"),
		count: z
			.number()
			.int()
			.min(1)
			.max(10)
			.default(5)
			.describe(
				"Number of results (1-10). Prefer 5-10 when you plan to inspect links with fetchUrl.",
			),
	}),
	execute: async ({ query, count }) => {
		const searchUrl = buildDuckDuckGoSearchUrl(query);
		const response = await fetch(searchUrl, {
			headers: {
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
			},
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) {
			return {
				provider: "duckduckgo",
				query,
				searchUrl,
				resultsSummary: `DuckDuckGo search request failed with status ${response.status}. You can still open the search URL manually.`,
				links: [],
				results: [],
				nextAction:
					"Retry later or use the searchUrl manually if DuckDuckGo is temporarily unavailable.",
			};
		}

		const html = await response.text();
		const results = extractDuckDuckGoResults(html, count);

		if (results.length === 0) {
			return {
				provider: "duckduckgo",
				query,
				searchUrl,
				resultsSummary:
					"DuckDuckGo returned no parseable result links. You can still open the search URL manually.",
				links: [],
				results: [],
				nextAction:
					"Open the searchUrl manually or try a more specific search query.",
			};
		}

		return {
			provider: "duckduckgo",
			query,
			searchUrl,
			resultsSummary: formatResults(results),
			links: results.map((result) => result.url),
			results,
			nextAction:
				"Use fetchUrl on the 5 to 10 most relevant links from the links array to extract deeper details.",
		};
	},
});

export const duckDuckGoWebSearchEnabled = true;
