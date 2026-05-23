import { constants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";

export const InstalledSkillStatusSchema = z.enum([
	"available",
	"partial",
	"invalid",
]);

export const InstalledSkillSchema = z.object({
	slug: z.string().min(1),
	name: z.string().min(1),
	description: z.string(),
	source: z.string().nullable(),
	installedAt: z.string().nullable(),
	skillFilePath: z.string(),
	metaFilePath: z.string().nullable(),
	summary: z.string(),
	usageGuidance: z.string().nullable(),
	status: InstalledSkillStatusSchema,
	warnings: z.array(z.string()),
});

export const InstalledSkillCatalogSchema = z.object({
	skills: z.array(InstalledSkillSchema),
	availableCount: z.number().int().nonnegative(),
	invalidCount: z.number().int().nonnegative(),
	scannedAt: z.string(),
	directoryStatus: z.enum(["available", "missing", "unreadable"]),
	directoryMessage: z.string().nullable(),
});

export type InstalledSkill = z.infer<typeof InstalledSkillSchema>;
export type InstalledSkillCatalog = z.infer<typeof InstalledSkillCatalogSchema>;

type SkillMeta = {
	slug?: string;
	name?: string;
	description?: string;
	source?: string;
	installedAt?: string;
};

type ParsedFrontmatter = {
	name?: string;
	description?: string;
};

const skillsDir = resolve(process.cwd(), "skills");

function normalizeLookupValue(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ");
}

function summarizeText(text: string, maxLength = 180): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function parseYamlFrontmatter(content: string): ParsedFrontmatter {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!match) return {};

	const result: ParsedFrontmatter = {};
	for (const line of match[1].split("\n")) {
		const nameMatch = line.match(/^name:\s*["']?(.+?)["']?\s*$/i);
		if (nameMatch) result.name = nameMatch[1].trim();
		const descriptionMatch = line.match(
			/^description:\s*["']?(.+?)["']?\s*$/i,
		);
		if (descriptionMatch) result.description = descriptionMatch[1].trim();
	}

	return result;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBulletItems(markdown: string, heading: string): string[] {
	const regex = new RegExp(
		`^##\\s+${escapeRegex(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|^#\\s+|$)`,
		"im",
	);
	const match = markdown.match(regex);
	if (!match) return [];

	return match[1]
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => /^[*-]\s+/.test(line))
		.map((line) => line.replace(/^[*-]\s+/, "").replace(/^✅\s*/, "").replace(/^❌\s*/, "").trim())
		.filter(Boolean);
}

function extractBodyWithoutFrontmatter(content: string): string {
	return content.replace(/^---\s*\n[\s\S]*?\n---\s*/u, "").trim();
}

function extractFirstParagraph(markdown: string): string {
	const paragraph = extractBodyWithoutFrontmatter(markdown)
		.split(/\n\s*\n/)
		.map((part) =>
			part
				.split("\n")
				.filter((line) => !line.trim().startsWith("#"))
				.join(" ")
				.trim(),
		)
		.find(Boolean);

	return paragraph ?? "";
}

function deriveSummary(meta: SkillMeta, markdown?: string): string {
	if (meta.description?.trim()) return summarizeText(meta.description);
	if (!markdown) return "";

	const firstParagraph = extractFirstParagraph(markdown);
	return firstParagraph ? summarizeText(firstParagraph) : "";
}

function deriveUsageGuidance(markdown?: string): string | null {
	if (!markdown) return null;

	const useCases = extractBulletItems(markdown, "When to Use");
	if (useCases.length > 0) {
		return summarizeText(`Use when: ${useCases.slice(0, 3).join("; ")}`);
	}

	const firstParagraph = extractFirstParagraph(markdown);
	return firstParagraph ? summarizeText(firstParagraph) : null;
}

function deriveDisplayName(
	slug: string,
	meta: SkillMeta,
	frontmatter: ParsedFrontmatter,
): string {
	return frontmatter.name?.trim() || meta.name?.trim() || slug;
}

function deriveDescription(
	meta: SkillMeta,
	frontmatter: ParsedFrontmatter,
	summary: string,
): string {
	return frontmatter.description?.trim() || meta.description?.trim() || summary;
}

function statusLabel(status: InstalledSkill["status"]): string {
	switch (status) {
		case "available":
			return "Available";
		case "partial":
			return "Available with limited detail";
		case "invalid":
			return "Installed but unreadable";
	}
	return "Unknown";
}

async function readOptionalTextFile(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, "utf-8");
	} catch {
		return null;
	}
}

async function readSkillMeta(filePath: string, warnings: string[]): Promise<SkillMeta> {
	const raw = await readOptionalTextFile(filePath);
	if (raw === null) return {};

	try {
		return JSON.parse(raw) as SkillMeta;
	} catch {
		warnings.push("Metadata file is malformed JSON.");
		return {};
	}
}

async function readInstalledSkillDir(slug: string): Promise<InstalledSkill> {
	const warnings: string[] = [];
	const skillDir = join(skillsDir, slug);
	const skillFilePath = join(skillDir, "SKILL.md");
	const metaFilePath = join(skillDir, "_meta.json");

	const [markdown, meta] = await Promise.all([
		readOptionalTextFile(skillFilePath),
		readSkillMeta(metaFilePath, warnings),
	]);

	if (markdown === null) {
		warnings.push("Skill definition file SKILL.md is missing or unreadable.");
	}

	const frontmatter = markdown ? parseYamlFrontmatter(markdown) : {};
	const summary = deriveSummary(meta, markdown ?? undefined);
	const usageGuidance = deriveUsageGuidance(markdown ?? undefined);
	const name = deriveDisplayName(slug, meta, frontmatter);
	const description = deriveDescription(meta, frontmatter, summary);
	const hasMeta = meta.name || meta.description || meta.source || meta.installedAt;

	let status: InstalledSkill["status"] = "available";
	if (markdown === null || (!summary && !usageGuidance)) {
		status = name ? "partial" : "invalid";
	}
	if (markdown === null && !hasMeta) {
		status = "invalid";
	}

	if (!description) {
		warnings.push("No concise description could be derived from the installed skill.");
	}

	return InstalledSkillSchema.parse({
		slug,
		name,
		description,
		source: meta.source ?? null,
		installedAt: meta.installedAt ?? null,
		skillFilePath,
		metaFilePath: hasMeta ? metaFilePath : null,
		summary,
		usageGuidance,
		status,
		warnings,
	});
}

export async function loadInstalledSkillsCatalog(): Promise<InstalledSkillCatalog> {
	const scannedAt = new Date().toISOString();

	try {
		await access(skillsDir, constants.R_OK);
	} catch {
		return InstalledSkillCatalogSchema.parse({
			skills: [],
			availableCount: 0,
			invalidCount: 0,
			scannedAt,
			directoryStatus: "missing",
			directoryMessage:
				"The local skills directory is missing or not readable, so I cannot inspect installed skills right now.",
		});
	}

	try {
		const entries = await readdir(skillsDir, { withFileTypes: true });
		const skillSlugs = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
		const skills = await Promise.all(skillSlugs.map((slug) => readInstalledSkillDir(slug)));

		return InstalledSkillCatalogSchema.parse({
			skills: skills.sort((left, right) => left.name.localeCompare(right.name)),
			availableCount: skills.filter((skill) => skill.status !== "invalid").length,
			invalidCount: skills.filter((skill) => skill.status === "invalid").length,
			scannedAt,
			directoryStatus: "available",
			directoryMessage: null,
		});
	} catch {
		return InstalledSkillCatalogSchema.parse({
			skills: [],
			availableCount: 0,
			invalidCount: 0,
			scannedAt,
			directoryStatus: "unreadable",
			directoryMessage:
				"The local skills directory exists, but I could not read its contents safely.",
		});
	}
}

export function formatInstalledSkillSummary(skill: InstalledSkill): string {
	const summary = skill.summary || skill.description || "No summary available.";
	const availability = skill.status === "available" ? "" : ` (${statusLabel(skill.status)})`;
	const warning = skill.warnings.length > 0 ? ` Warning: ${skill.warnings[0]}` : "";
	return `- ${skill.name}${availability}: ${summary}${warning}`;
}

export function normalizeInstalledSkillLookup(query: string): string {
	return normalizeLookupValue(query);
}

export function lookupInstalledSkill(
	catalog: InstalledSkillCatalog,
	query: string,
):
	| { kind: "match"; skill: InstalledSkill }
	| { kind: "missing" }
	| { kind: "ambiguous"; candidates: InstalledSkill[] } {
	const normalizedQuery = normalizeLookupValue(query);

	const exactSlug = catalog.skills.find(
		(skill) => normalizeLookupValue(skill.slug) === normalizedQuery,
	);
	if (exactSlug) return { kind: "match", skill: exactSlug };

	const exactName = catalog.skills.find(
		(skill) => normalizeLookupValue(skill.name) === normalizedQuery,
	);
	if (exactName) return { kind: "match", skill: exactName };

	const partialMatches = catalog.skills.filter((skill) => {
		const normalizedName = normalizeLookupValue(skill.name);
		const normalizedSlug = normalizeLookupValue(skill.slug);
		return (
			normalizedName.includes(normalizedQuery) ||
			normalizedSlug.includes(normalizedQuery) ||
			normalizedQuery.includes(normalizedName) ||
			normalizedQuery.includes(normalizedSlug)
		);
	});

	if (partialMatches.length === 1) {
		return { kind: "match", skill: partialMatches[0] };
	}

	if (partialMatches.length > 1) {
		return { kind: "ambiguous", candidates: partialMatches.slice(0, 5) };
	}

	return { kind: "missing" };
}

export function buildInstalledSkillDetailView(skill: InstalledSkill) {
	return {
		displayName: skill.name,
		purpose: skill.summary || skill.description || "No purpose summary is available.",
		recommendedUseCases: skill.usageGuidance
			? skill.usageGuidance
					.replace(/^Use when:\s*/i, "")
					.split(/;\s*/)
					.map((item) => item.trim())
					.filter(Boolean)
			: [],
		limitations: skill.warnings,
		availabilityStatus: statusLabel(skill.status),
	};
}
