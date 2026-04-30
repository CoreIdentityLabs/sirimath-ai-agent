import { createTool } from "@voltagent/core";
import { z } from "zod";

const MAX_RESPONSE_CHARS = 12_000;

export const fetchUrlTool = createTool({
	name: "fetchUrl",
	description:
		"Fetch the content of a URL via HTTP GET. Use for calling REST APIs, fetching JSON data, or reading plain-text web pages. Not suitable for JavaScript-rendered pages.",
	parameters: z.object({
		url: z.string().url().describe("The URL to fetch"),
		headers: z
			.record(z.string())
			.optional()
			.describe("Optional HTTP headers (e.g. Accept, Authorization)"),
	}),
	execute: async ({ url, headers = {} }) => {
		const response = await fetch(url, {
			method: "GET",
			headers: { "User-Agent": "sirimath-ai-agent/1.0", ...headers },
			signal: AbortSignal.timeout(15_000),
		});

		const contentType = response.headers.get("content-type") ?? "";
		const raw = await response.text();
		const body =
			raw.length > MAX_RESPONSE_CHARS
				? `${raw.slice(0, MAX_RESPONSE_CHARS)}…[truncated]`
				: raw;

		return {
			status: response.status,
			contentType,
			body,
			ok: response.ok,
		};
	},
});
