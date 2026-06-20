import { createTool } from "@voltagent/core";
import { z } from "zod";
import {
	buildInstalledSkillDetailView,
	loadInstalledSkillsCatalog,
	lookupInstalledSkill,
} from "./shared/installed-skills.js";

export const readInstalledSkillTool = createTool({
	name: "readInstalledSkill",
	description:
		"Inspect a locally installed skill by name or slug. Use when the user asks what a specific installed skill does or whether a local skill can help.",
	parameters: z.object({
		query: z.string().min(1),
	}),
	execute: async ({ query }) => {
		const catalog = await loadInstalledSkillsCatalog();

		if (catalog.directoryStatus !== "available") {
			return `${catalog.directoryMessage} If you need a missing capability, I can help you discover a skill to install.`;
		}

		const match = lookupInstalledSkill(catalog, query);
		if (match.kind === "missing") {
			return `I could not find an installed skill matching "${query}". If it is not installed yet, ask me to find skills and I can suggest one.`;
		}

		if (match.kind === "ambiguous") {
			return `I found multiple installed skills that could match "${query}": ${match.candidates.map((skill) => skill.name).join(", ")}. Tell me which one you want.`;
		}

		const detail = buildInstalledSkillDetailView(match.skill);
		const useCases =
			detail.recommendedUseCases.length > 0
				? detail.recommendedUseCases.map((item) => `- ${item}`).join("\n")
				: "- No specific use cases were extracted from the installed definition.";
		const limitations =
			detail.limitations.length > 0
				? detail.limitations.map((item) => `- ${item}`).join("\n")
				: "- No special limitations were detected from the local files.";

		return [
			`${detail.displayName} (${detail.availabilityStatus})`,
			`Purpose: ${detail.purpose}`,
			"Recommended use cases:",
			useCases,
			"Limitations or warnings:",
			limitations,
			match.skill.source ? `Source: ${match.skill.source}` : "",
		]
			.filter(Boolean)
			.join("\n");
	},
});
