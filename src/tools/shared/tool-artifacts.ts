import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { monotonicFactory } from "ulid";
import { loadLlmLimitConfig } from "../../config/llm-limits.js";
import { clampSnippet, clampText } from "./tool-output.js";

const ulid = monotonicFactory();
const ARTIFACT_DIR = resolve(process.cwd(), ".voltagent", "tool-artifacts");
const llmLimits = loadLlmLimitConfig();
const SMALL_CONTEXT_MODEL =
	(llmLimits.contextWindowTokens ?? Number.POSITIVE_INFINITY) <= 4_096;
const DEFAULT_MAX_INLINE_CHARS = Number(
	process.env.LLM_TOOL_MAX_INLINE_CHARS ?? (SMALL_CONTEXT_MODEL ? 800 : 1_200),
);
const DEFAULT_CHUNK_CHARS = Number(
	process.env.LLM_TOOL_CHUNK_CHARS ?? (SMALL_CONTEXT_MODEL ? 320 : 900),
);
const DEFAULT_SEARCH_RESULTS = Number(
	process.env.LLM_TOOL_SEARCH_RESULTS ?? (SMALL_CONTEXT_MODEL ? 1 : 3),
);
const DEFAULT_SEARCH_EXCERPT_CHARS = Number(
	process.env.LLM_TOOL_SEARCH_EXCERPT_CHARS ?? (SMALL_CONTEXT_MODEL ? 96 : 220),
);

export interface ToolArtifactChunk {
	index: number;
	text: string;
}

export interface ToolArtifactRecord {
	artifactId: string;
	toolName: string;
	createdAt: string;
	preview: string;
	text: string;
	chunks: ToolArtifactChunk[];
}

export interface ExternalizedToolOutput {
	artifactStored: true;
	artifactId: string;
	toolName: string;
	chunkCount: number;
	summary: string;
	nextAction: string;
	autoContext?: {
		query: string;
		recommendedChunkIndex: number;
		text: string;
	};
}

function safeStringify(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function buildChunks(
	text: string,
	chunkChars = DEFAULT_CHUNK_CHARS,
): ToolArtifactChunk[] {
	if (!text.trim()) return [];

	const chunks: ToolArtifactChunk[] = [];
	for (let index = 0; index < text.length; index += chunkChars) {
		chunks.push({
			index: chunks.length,
			text: text.slice(index, index + chunkChars),
		});
	}
	return chunks;
}

function buildCompactObject(value: unknown): unknown {
	if (typeof value === "string") {
		return clampText(value, 400);
	}

	if (Array.isArray(value)) {
		return value.slice(0, 3).map((item) => buildCompactObject(item));
	}

	if (!value || typeof value !== "object") {
		return value;
	}

	const compact: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry === "string") {
			compact[key] = clampText(entry, 240);
			continue;
		}

		if (
			typeof entry === "number" ||
			typeof entry === "boolean" ||
			entry === null
		) {
			compact[key] = entry;
			continue;
		}

		if (Array.isArray(entry)) {
			compact[key] = entry.slice(0, 3).map((item) => buildCompactObject(item));
			continue;
		}

		if (typeof entry === "object") {
			compact[key] = buildCompactObject(entry);
		}
	}

	return compact;
}

function summarizeCompactObject(value: unknown): string {
	if (typeof value === "string") {
		return clampText(value.replace(/\s+/g, " ").trim(), 180);
	}

	if (Array.isArray(value)) {
		return `Array with ${value.length} items stored externally.`;
	}

	if (!value || typeof value !== "object") {
		return `Value of type ${typeof value} stored externally.`;
	}

	const record = value as Record<string, unknown>;
	const fields = Object.keys(record).slice(0, 6);
	const resultCount = Array.isArray(record.results)
		? record.results.length
		: null;
	const linkCount = Array.isArray(record.links) ? record.links.length : null;
	const provider =
		typeof record.provider === "string" ? `provider=${record.provider}` : null;
	const query =
		typeof record.query === "string" ? clampText(record.query, 80) : null;

	return [
		"Large tool output stored externally.",
		provider,
		query ? `query="${query}"` : null,
		resultCount !== null ? `results=${resultCount}` : null,
		linkCount !== null ? `links=${linkCount}` : null,
		fields.length > 0 ? `fields=${fields.join(", ")}` : null,
	]
		.filter(Boolean)
		.join(" ");
}

function keywordScore(text: string, query: string): number {
	const haystack = text.toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

async function ensureArtifactDir(): Promise<void> {
	await mkdir(ARTIFACT_DIR, { recursive: true });
}

function artifactPath(artifactId: string): string {
	return join(ARTIFACT_DIR, `${artifactId}.json`);
}

export function shouldExternalizeToolOutput(output: unknown): boolean {
	return safeStringify(output).length > DEFAULT_MAX_INLINE_CHARS;
}

export async function storeToolArtifact(
	toolName: string,
	output: unknown,
): Promise<ToolArtifactRecord> {
	const text = safeStringify(output);
	const record: ToolArtifactRecord = {
		artifactId: ulid(),
		toolName,
		createdAt: new Date().toISOString(),
		preview: clampText(text, 800),
		text,
		chunks: buildChunks(text),
	};

	await ensureArtifactDir();
	await writeFile(
		artifactPath(record.artifactId),
		JSON.stringify(record, null, 2),
	);
	return record;
}

export async function loadToolArtifact(
	artifactId: string,
): Promise<ToolArtifactRecord | null> {
	try {
		const raw = await readFile(artifactPath(artifactId), "utf8");
		return JSON.parse(raw) as ToolArtifactRecord;
	} catch {
		return null;
	}
}

export async function externalizeToolOutput(
	toolName: string,
	output: unknown,
	query?: string | null,
): Promise<ExternalizedToolOutput> {
	const compact = buildCompactObject(output);
	const artifact = await storeToolArtifact(toolName, output);
	const baseResult: ExternalizedToolOutput = {
		artifactStored: true,
		artifactId: artifact.artifactId,
		toolName,
		chunkCount: artifact.chunks.length,
		summary: summarizeCompactObject(compact),
		nextAction:
			"Use searchToolArtifact to find relevant chunks, then readToolArtifact only for the exact chunk you need.",
	};

	const normalizedQuery = query?.trim();
	if (!normalizedQuery) {
		return baseResult;
	}

	const autoSearch = await searchArtifactChunks(
		artifact.artifactId,
		normalizedQuery,
	);
	if ("error" in autoSearch) {
		return baseResult;
	}

	const autoRead = await readArtifactChunk(
		artifact.artifactId,
		autoSearch.recommendedChunkIndex,
	);
	if ("error" in autoRead) {
		return baseResult;
	}

	return {
		...baseResult,
		autoContext: {
			query: normalizedQuery,
			recommendedChunkIndex: autoSearch.recommendedChunkIndex,
			text: autoRead.text,
		},
	};
}

export async function readArtifactChunk(
	artifactId: string,
	chunkIndex = 0,
): Promise<
	| {
			artifactId: string;
			toolName: string;
			chunkIndex: number;
			chunkCount: number;
			text: string;
	  }
	| { error: string }
> {
	const artifact = await loadToolArtifact(artifactId);
	if (!artifact) {
		return { error: `No stored tool artifact found for ${artifactId}.` };
	}

	const chunk = artifact.chunks[chunkIndex];
	if (!chunk) {
		return {
			error: `Chunk ${chunkIndex} does not exist for artifact ${artifactId}. Available chunks: 0 to ${Math.max(artifact.chunks.length - 1, 0)}.`,
		};
	}

	return {
		artifactId,
		toolName: artifact.toolName,
		chunkIndex,
		chunkCount: artifact.chunks.length,
		text: clampText(chunk.text, DEFAULT_CHUNK_CHARS),
	};
}

export async function searchArtifactChunks(
	artifactId: string,
	query: string,
): Promise<
	| {
			artifactId: string;
			toolName: string;
			chunkCount: number;
			recommendedChunkIndex: number;
			matches: Array<{
				chunkIndex: number;
				score: number;
				hint: string;
			}>;
			nextAction: string;
	  }
	| { error: string }
> {
	const artifact = await loadToolArtifact(artifactId);
	if (!artifact) {
		return { error: `No stored tool artifact found for ${artifactId}.` };
	}

	const matches = artifact.chunks
		.map((chunk) => ({
			chunkIndex: chunk.index,
			score: keywordScore(chunk.text, query),
			hint: clampSnippet(chunk.text, DEFAULT_SEARCH_EXCERPT_CHARS),
		}))
		.filter((match) => match.score > 0)
		.sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex)
		.slice(0, DEFAULT_SEARCH_RESULTS);

	const fallbackMatches = artifact.chunks.slice(0, 1).map((chunk) => ({
		chunkIndex: chunk.index,
		score: 0,
		hint: clampSnippet(chunk.text, DEFAULT_SEARCH_EXCERPT_CHARS),
	}));
	const selectedMatches = matches.length > 0 ? matches : fallbackMatches;

	return {
		artifactId,
		toolName: artifact.toolName,
		chunkCount: artifact.chunks.length,
		recommendedChunkIndex: selectedMatches[0]?.chunkIndex ?? 0,
		matches: selectedMatches,
		nextAction:
			"Call readToolArtifact only for recommendedChunkIndex unless you need a different chunk.",
	};
}
