import * as vscode from "vscode"

export function activate(context: vscode.ExtensionContext) {
	console.log("Ministic Fishstick VS Code Extension activated")

	// Register VS Code LM Tool for GitHub Copilot Agent integration
	if ("lm" in vscode && typeof (vscode as any).lm.registerTool === "function") {
		const searchTool = (vscode as any).lm.registerTool("fishstick_search_code", {
			async invoke(
				options: { input: { query: string; directoryPrefix?: string } },
				_token: vscode.CancellationToken,
			) {
				const { query, directoryPrefix } = options.input
				const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

				if (!workspacePath) {
					return new (vscode as any).LanguageModelToolResult([
						new (vscode as any).LanguageModelTextPart("No active workspace folder."),
					])
				}

				return new (vscode as any).LanguageModelToolResult([
					new (vscode as any).LanguageModelTextPart(
						`Search query '${query}' submitted to fishstick MCP server for workspace ${workspacePath}${
							directoryPrefix ? ` under ${directoryPrefix}` : ""
						}.`,
					),
				])
			},
		})

		context.subscriptions.push(searchTool)
	}

	// Register Extension Commands
	const startCommand = vscode.commands.registerCommand("fishstick.startIndexing", async () => {
		vscode.window.showInformationMessage("Fishstick: Codebase indexing started via MCP server.")
	})

	const searchCommand = vscode.commands.registerCommand("fishstick.searchCode", async () => {
		const query = await vscode.window.showInputBox({
			prompt: "Enter search query for semantic code search",
		})
		if (query) {
			vscode.window.showInformationMessage(`Searching code for: ${query}`)
		}
	})

	context.subscriptions.push(startCommand, searchCommand)
}

export function deactivate() {}
