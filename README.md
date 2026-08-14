# ministic-fishstick

<p align="center">
  <img src="media/ministic-fishstick-github-readme-banner-1000px.png" alt="Banner" width=650 />
</p>

> Minimal, high-performance Model Context Protocol (MCP) server for semantic code indexing and vector search powered by **Bun** and **TypeScript**.

`ministic-fishstick` extracts code-indexing capabilities into a standalone MCP server that can be used directly with AI CLI agents (OpenCode, Claude Desktop, Cursor) as well as GitHub Copilot Agents in VS Code.

---

## Features

- 🚀 **Bun Native & Fast:** Built for Bun with zero-lock overhead and fast execution.
- 💾 **Zero-Docker SQLite Vector Search:** Native `bun:sqlite` vector storage with Float32Array cosine similarity — runs locally without needing Docker or external database services.
- 🔌 **Qdrant Support:** Optional fallback or upgrade to a remote or local Qdrant vector database (`@qdrant/js-client-rest`).
- 🌳 **Tree-Sitter AST Parsing:** Accurate semantic code block extraction for 25+ programming languages using `web-tree-sitter` and `tree-sitter-wasms`.
- 🛡️ **Smart Ignore Rules (`.fishignore` + `.gitignore`):** Respects both workspace `.gitignore` and `.fishignore` patterns to exclude sensitive files or build output.
- ⚙️ **Tiered Configuration System:** Resolves configuration seamlessly across runtime MCP tool overrides, workspace `.fishstick.json`, global `~/.config/fishstick/fishstick.json`, `.env` files, and defaults.
- 🤖 **VS Code & Copilot Agent Ready:** Includes a `vscode-extension/` wrapper exposing native VS Code MCP Server contributions (`contributes.mcpServers`) and Copilot LM tools.

---

## Default Behavior

When started without extra configuration:
1. **Embedding Provider:** Defaults to **OpenAI** using `text-embedding-3-small` (requires `OPENAI_API_KEY`).
2. **Vector Store:** Defaults to local zero-docker **`sqlite`** storage located at `<workspace>/.fishstick/vectors.sqlite`.
3. **Local Cache:** Incremental file scan hashes stored in `<workspace>/.fishstick/cache.sqlite`.
4. **Target Directory:** Indexes the current working directory (`process.cwd()`).

---

## Getting Started

### Prerequisites

- **Bun** (v1.1+): Install via `curl -fsSL https://bun.sh/install | bash`
- An OpenAI API Key (or an alternative supported provider like Ollama, Gemini, Mistral, Bedrock, etc.)

### Installation & Local Setup

```bash
# Clone the repository
git clone https://github.com/your-org/ministic-fishstick.git
cd ministic-fishstick

# Install dependencies
bun install

# Run tests
bun test

# Type-check
bun check-types
```

---

## Usage

### 1. Running as an MCP Server (Stdio)

Start the stdio MCP server directly using Bun:

```bash
OPENAI_API_KEY="sk-..." bun run src/index.ts
```

### 2. Configuring in OpenCode / Claude Desktop / Cursor

Add `ministic-fishstick` to your MCP client configuration (e.g. `opencode.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fishstick": {
      "command": "bun",
      "args": ["run", "/path/to/ministic-fishstick/src/index.ts"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "VECTOR_STORE_PROVIDER": "sqlite"
      }
    }
  }
}
```

### 3. VS Code Copilot Agent Integration

For VS Code users, the included `vscode-extension/` folder provides an extension wrapper:
1. Open `vscode-extension/` in VS Code or install the compiled extension package.
2. The extension automatically registers `fishstick` in VS Code's native MCP server catalog and exposes the `fishstick_search_code` tool to GitHub Copilot chat participants and agents.

---

## Available MCP Tools

The server exposes five core MCP tools:

| MCP Tool Name | Description |
|---|---|
| `code_index_search` | Perform semantic vector search over the indexed codebase. Accepts `query`, optional `directoryPrefix`, and `workspacePath`. |
| `code_index_start` | Trigger background directory scan and file watcher (`chokidar`) for a workspace folder. |
| `code_index_status` | Retrieve current indexing state (`Standby`, `Indexing`, `Indexed`, `Error`), block counts, and file watcher progress. |
| `code_index_clear` | Clear vector database tables and local cache files for a workspace. |
| `code_index_configure` | Dynamically update embedding provider, model ID, search minScore, maxResults, or vector store at runtime. |

---

## Configuration Hierarchy

Configuration is resolved automatically in the following order of precedence (highest to lowest):

```
┌─────────────────────────────────────────────────────────┐
│ Priority 1: Dynamic MCP Tool Calls (`code_index_config`)│
├─────────────────────────────────────────────────────────┤
│ Priority 2: Workspace Config (`.fishstick.json`)        │
├─────────────────────────────────────────────────────────┤
│ Priority 3: Global User Config                          │
│             (`~/.config/fishstick/fishstick.json`)      │
├─────────────────────────────────────────────────────────┤
│ Priority 4: Environment Variables (`.env`) / Defaults   │
└─────────────────────────────────────────────────────────┘
```

### Example `.fishstick.json` or `~/.config/fishstick/fishstick.json`

```json
{
  "enabled": true,
  "vectorStore": {
    "provider": "sqlite",
    "qdrantUrl": "http://localhost:6333"
  },
  "embedder": {
    "provider": "openai",
    "modelId": "text-embedding-3-small",
    "apiKey": "sk-..."
  },
  "search": {
    "minScore": 0.3,
    "maxResults": 20
  }
}
```

### Environment Variables (`.env`)

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API Key for default embedder | — |
| `VECTOR_STORE_PROVIDER` | `sqlite` (zero-docker local) or `qdrant` | `sqlite` |
| `QDRANT_URL` | Qdrant database server URL | `http://localhost:6333` |
| `EMBEDDER_PROVIDER` | Embedder provider (`openai`, `ollama`, `gemini`, etc.) | `openai` |
| `EMBEDDER_MODEL_ID` | Model identifier | `text-embedding-3-small` |
| `SEARCH_MIN_SCORE` | Similarity score cutoff (0.0 to 1.0) | `0.3` |
| `SEARCH_MAX_RESULTS` | Max results returned by search | `20` |

---

## Ignore Rules (`.fishignore` + `.gitignore`)

`ministic-fishstick` uses `FishIgnoreController` to filter files before parsing and indexing:
- **`.gitignore`**: Automatically respected if present in the workspace.
- **`.fishignore`**: Custom ignore file for indexing rules (uses standard `.gitignore` glob syntax).
- **Auto-ignored:** `.git`, `.fishignore`, `.fishstick.json`, `node_modules/`, binary files, and vector database caches are always excluded.

---

## License

Apache 2.0 © 2026 Israel Flores-Arbolay.
