import { createTool } from "@voltagent/core";
import { z } from "zod";
import {
	formatInstalledSkillSummary,
	loadInstalledSkillsCatalog,
} from "./shared/installed-skills.js";

export const listInstalledSkillsTool = createTool({
	name: "listInstalledSkills",
	description:
		"List skills already installed locally in the skills directory. Use when the user asks what skills are already available or installed.",
	parameters: z.object({
		includeWarnings: z.boolean().default(false),
	}),
	execute: async ({ includeWarnings }) => {
		const catalog = await loadInstalledSkillsCatalog();

		if (catalog.directoryStatus !== "available") {
			return `${catalog.directoryMessage} You can still ask for help normally, or ask me to find skills to install another capability.`;
		}

		if (catalog.skills.length === 0) {
			return "No local skills are installed yet. If you need another capability, ask me to find skills and I can suggest one to install.";
		}

		const header = `Installed skills (${catalog.availableCount} usable${catalog.invalidCount > 0 ? `, ${catalog.invalidCount} with issues` : ""}):`;
		const lines = includeWarnings
			? catalog.skills.map((skill) => formatInstalledSkillSummary(skill))
			: catalog.skills.map((skill) => {
					const summary = skill.summary || skill.description || "No summary available.";
					const availability = skill.status === "available" ? "" : ` (${skill.status})`;
					return `- ${skill.name}${availability}: ${summary}`;
				});

		return [
			header,
			...lines,
			"",
			"Ask about a skill by name if you want more detail, or ask me to find skills if nothing installed fits your task.",
		].join("\n");
	},
});
