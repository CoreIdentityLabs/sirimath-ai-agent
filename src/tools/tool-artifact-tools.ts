import { createTool } from "@voltagent/core";
import { z } from "zod";
import {
	readArtifactChunk,
	searchArtifactChunks,
} from "./shared/tool-artifacts.js";

export const readToolArtifactTool = createTool({
	name: "readToolArtifact",
	description: "Read one stored artifact chunk by id and chunk index.",
	parameters: z.object({
		artifactId: z.string().min(1),
		chunkIndex: z.number().int().min(0).default(0),
	}),
	execute: async ({ artifactId, chunkIndex }) =>
		readArtifactChunk(artifactId, chunkIndex),
});

export const searchToolArtifactTool = createTool({
	name: "searchToolArtifact",
	description: "Find the best chunk index in a stored artifact by query.",
	parameters: z.object({
		artifactId: z.string().min(1),
		query: z.string().min(1),
	}),
	execute: async ({ artifactId, query }) =>
		searchArtifactChunks(artifactId, query),
});
