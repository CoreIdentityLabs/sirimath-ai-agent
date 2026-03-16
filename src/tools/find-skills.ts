import { createTool } from "@voltagent/core";
import { z } from "zod";

interface SkillSearchResult {
	id: string;
	skillId: string;
	name: string;
	installs: number;
	source: string;
}

interface SkillsApiResponse {
	query: string;
	searchType: string;
	skills: SkillSearchResult[];
	count: number;
	duration_ms: number;
}

function formatInstalls(installs: number): string {
	if (installs >= 1_000_000) return `${(installs / 1_000_000).toFixed(1)}M`;
	if (installs >= 1_000) return `${(installs / 1_000).toFixed(1)}K`;
	return String(installs);
}

function formatTable(skills: SkillSearchResult[]): string {
	const header =
		"#   Skill                              Source                  Installs\n" +
		"─── ─────────────────────────────────  ──────────────────────  ────────";

	const rows = skills.map((skill, i) => {
		const num = String(i + 1).padEnd(3);
		const name = skill.name.substring(0, 35).padEnd(36);
		const source = skill.source.substring(0, 22).padEnd(23);
		const installs = formatInstalls(skill.installs);
		return `${num} ${name} ${source} ${installs}`;
	});

	// Machine-readable reference block so the LLM can pass correct values to installSkill
	const ref = skills
		.map(
			(s, i) =>
				`${i + 1}. skillId="${s.skillId}" source="${s.source}" name="${s.name}"`,
		)
		.join("\n");

	return [
		header,
		...rows,
		"",
		"🔗 Browse all: https://skills.sh/",
		'Pick a number to install (or "none")',
		"",
		"Install reference:",
		ref,
	].join("\n");
}

export const findSkillsTool = createTool({
	name: "findSkills",
	description:
		"Search for agent skills on skills.sh. Use when the user asks to find, discover, or search for skills, or says 'how do I do X' where X might be an existing skill. Returns a numbered list — use the Install reference block to get the exact skillId and source when calling installSkill.",
	parameters: z.object({
		query: z
			.string()
			.min(1)
			.describe("Search term (e.g., 'react', 'code review', 'web scraping')"),
	}),
	execute: async ({ query }) => {
		let data: SkillsApiResponse;

		try {
			const searchRes = await fetch(
				`https://skills.sh/api/search?q=${encodeURIComponent(query)}`,
				{ signal: AbortSignal.timeout(15_000) },
			);
			if (!searchRes.ok) {
				return `Skill search failed: HTTP ${searchRes.status} from skills.sh API.`;
			}
			data = (await searchRes.json()) as SkillsApiResponse;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return `Skill search is temporarily unavailable: ${msg}`;
		}

		const skills = data.skills ?? [];

		if (skills.length === 0) {
			return `No matching skills found for '${query}'.`;
		}

		// Sort by installs descending and show top 15
		const top = skills.sort((a, b) => b.installs - a.installs).slice(0, 15);

		return formatTable(top);
	},
});
