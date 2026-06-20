import {
	type Tool,
	type ToolExecuteOptions,
	createTool,
} from "@voltagent/core";
import {
	externalizeToolOutput,
	shouldExternalizeToolOutput,
} from "./shared/tool-artifacts.js";

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	return Boolean(
		value &&
			typeof value === "object" &&
			Symbol.asyncIterator in (value as Record<PropertyKey, unknown>),
	);
}

function extractTextFromMessageContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	return content
		.map((part) => {
			if (typeof part === "string") return part;
			if (!part || typeof part !== "object") return "";

			const record = part as Record<string, unknown>;
			if (typeof record.text === "string") return record.text;
			if (record.type === "text" && typeof record.text === "string") {
				return record.text;
			}

			return "";
		})
		.filter(Boolean)
		.join(" ")
		.trim();
}

function resolveLatestUserQuery(options?: ToolExecuteOptions): string | null {
	const messages = options?.toolContext?.messages;
	if (!Array.isArray(messages)) return null;

	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index] as
			| { role?: unknown; content?: unknown }
			| undefined;
		if (message?.role !== "user") continue;

		const text = extractTextFromMessageContent(message.content);
		if (text) return text;
	}

	return null;
}

export function wrapToolWithArtifactSupport(
	// biome-ignore lint/suspicious/noExplicitAny: VoltAgent tool generics are invariant across schemas
	tool: Tool<any, any>,
	// biome-ignore lint/suspicious/noExplicitAny: VoltAgent tool generics are invariant across schemas
): Tool<any, any> {
	if (!tool.execute) return tool;
	if (tool.name === "readToolArtifact" || tool.name === "searchToolArtifact") {
		return tool;
	}

	return createTool({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters,
		outputSchema: tool.outputSchema,
		tags: tool.tags,
		needsApproval: tool.needsApproval,
		providerOptions: tool.providerOptions,
		toModelOutput: tool.toModelOutput,
		hooks: tool.hooks,
		execute: async (args, options?: ToolExecuteOptions) => {
			const output = await tool.execute?.(args, options);
			if (isAsyncIterable(output) || !shouldExternalizeToolOutput(output)) {
				return output;
			}

			return externalizeToolOutput(
				tool.name,
				output,
				resolveLatestUserQuery(options),
			);
		},
		// biome-ignore lint/suspicious/noExplicitAny: VoltAgent tool generics are invariant across schemas
	}) as Tool<any, any>;
}

export function wrapToolsWithArtifactSupport(
	// biome-ignore lint/suspicious/noExplicitAny: VoltAgent tool generics are invariant across schemas
	tools: Tool<any, any>[],
	// biome-ignore lint/suspicious/noExplicitAny: VoltAgent tool generics are invariant across schemas
): Tool<any, any>[] {
	return tools.map((tool) => wrapToolWithArtifactSupport(tool));
}
