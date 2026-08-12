import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { SearchToolInputSchema, handleSearchTool } from "./tools/search"
import { StartIndexingToolInputSchema, handleStartIndexingTool } from "./tools/index"
import { StatusToolInputSchema, handleStatusTool } from "./tools/status"
import { ClearToolInputSchema, handleClearTool } from "./tools/clear"
import { ConfigureToolInputSchema, handleConfigureTool } from "./tools/configure"

export function createMcpServer(): McpServer {
	const server = new McpServer({
		name: "ministic-fishstick",
		version: "0.1.0",
	})

	server.tool(
		"code_index_search",
		"Perform semantic vector search over the indexed codebase",
		SearchToolInputSchema.shape,
		async (args) => handleSearchTool(args),
	)

	server.tool(
		"code_index_start",
		"Start workspace scanning and file watching for code indexing",
		StartIndexingToolInputSchema.shape,
		async (args) => handleStartIndexingTool(args),
	)

	server.tool(
		"code_index_status",
		"Check indexing state, statistics, and file watcher progress",
		StatusToolInputSchema.shape,
		async (args) => handleStatusTool(args),
	)

	server.tool(
		"code_index_clear",
		"Clear index database and local cache for a workspace",
		ClearToolInputSchema.shape,
		async (args) => handleClearTool(args),
	)

	server.tool(
		"code_index_configure",
		"Dynamically update embedding provider or vector store settings",
		ConfigureToolInputSchema.shape,
		async (args) => handleConfigureTool(args),
	)

	return server
}
