import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTool } from "@voltagent/core";
import { z } from "zod";

interface SkillFrontmatter {
	name?: string;
	description?: string;
}

function parseYamlFrontmatter(content: string): SkillFrontmatter {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!match) return {};
	const yaml = match[1];
	const result: SkillFrontmatter = {};
	for (const line of yaml.split("\n")) {
		const nameMatch = line.match(/^name:\s*["']?(.+?)["']?\s*$/);
		if (nameMatch) result.name = nameMatch[1].trim();
		const descMatch = line.match(/^description:\s*["']?(.+?)["']?\s*$/);
		if (descMatch) result.description = descMatch[1].trim();
	}
	return result;
}

async function fetchSkillMd(source: string, skillId: string): Promise<string> {
	const branches = ["main", "master"];

	// Path candidates in order of likelihood (the skills CLI stores skills in a `skills/` subdir)
	const pathCandidates = [`skills/${skillId}/SKILL.md`, `${skillId}/SKILL.md`];

	for (const branch of branches) {
		for (const path of pathCandidates) {
			const url = `https://raw.githubusercontent.com/${source}/${branch}/${path}`;
			try {
				const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
				if (res.ok) {
					const text = await res.text();
					if (
						text &&
						!text.trimStart().startsWith("<!DOCTYPE") &&
						!text.trimStart().startsWith("<html")
					) {
						return text;
					}
				}
			} catch {
				// Try next candidate
			}
		}
	}

	// Fallback: use GitHub Contents API to list the skills/ directory and fuzzy-match by skillId
	for (const branch of branches) {
		try {
			const apiUrl = `https://api.github.com/repos/${source}/contents/skills?ref=${branch}`;
			const apiRes = await fetch(apiUrl, {
				signal: AbortSignal.timeout(10_000),
			});
			if (!apiRes.ok) continue;

			const entries = (await apiRes.json()) as Array<{
				name: string;
				type: string;
			}>;
			if (!Array.isArray(entries)) continue;

			// Find a directory that matches the skillId (exact, or skillId without common prefixes)
			const match = entries.find(
				(e) =>
					e.type === "dir" &&
					(e.name === skillId ||
						skillId.endsWith(`-${e.name}`) ||
						skillId.startsWith(`${e.name}-`)),
			);

			if (match) {
				const rawUrl = `https://raw.githubusercontent.com/${source}/${branch}/skills/${match.name}/SKILL.md`;
				const rawRes = await fetch(rawUrl, {
					signal: AbortSignal.timeout(10_000),
				});
				if (rawRes.ok) {
					const text = await rawRes.text();
					if (text && !text.trimStart().startsWith("<!DOCTYPE")) return text;
				}
			}
		} catch {
			// Try next branch
		}
	}

	throw new Error(
		`SKILL.md not found for skillId="${skillId}" in ${source}. ` +
			`Tried paths: skills/${skillId}/SKILL.md and ${skillId}/SKILL.md on main/master.`,
	);
}

export const installSkillTool = createTool({
	name: "installSkill",
	description:
		"Install a skill from skills.sh. Only use after findSkills has returned results and the user has confirmed which skill to install. Fetches the skill definition from GitHub and saves it locally.",
	parameters: z.object({
		skillId: z
			.string()
			.min(1)
			.describe("Skill directory name (e.g., 'vercel-react-best-practices')"),
		source: z
			.string()
			.min(1)
			.describe("GitHub repo path (e.g., 'vercel-labs/agent-skills')"),
		name: z.string().min(1).describe("Display name for the skill"),
	}),
	execute: async ({ skillId, source, name }) => {
		let content: string;
		try {
			content = await fetchSkillMd(source, skillId);
		} catch (err) {
			return `❌ Could not install "${name}": ${err instanceof Error ? err.message : "Failed to fetch SKILL.md"}`;
		}

		// Validate content
		if (!content || content.trim().length === 0) {
			return `❌ Could not install "${name}": Fetched SKILL.md is empty.`;
		}
		if (
			content.trimStart().startsWith("<!DOCTYPE") ||
			content.trimStart().startsWith("<html")
		) {
			return `❌ Could not install "${name}": Received an HTML error page instead of SKILL.md.`;
		}
		if (content.trim().length < 50) {
			return `❌ Could not install "${name}": SKILL.md content is too short to be valid.`;
		}
		if (!content.includes("#")) {
			return `❌ Could not install "${name}": SKILL.md does not appear to be valid Markdown (no headings found).`;
		}

		const frontmatter = parseYamlFrontmatter(content);
		const skillName = frontmatter.name ?? name;
		const description = frontmatter.description ?? "";

		const skillDir = join(".", "skills", skillId);

		try {
			await mkdir(skillDir, { recursive: true });
			await writeFile(join(skillDir, "SKILL.md"), content, "utf-8");
			await writeFile(
				join(skillDir, "_meta.json"),
				JSON.stringify(
					{
						slug: skillId,
						name: skillName,
						description,
						source,
						version: "1.0.0",
						installedAt: new Date().toISOString(),
					},
					null,
					2,
				),
				"utf-8",
			);
		} catch (err) {
			return `❌ Could not install "${name}": File system error — ${err instanceof Error ? err.message : String(err)}`;
		}

		return `✅ Installed "${skillName}" skill successfully.\nLocation: ./skills/${skillId}/`;
	},
});
