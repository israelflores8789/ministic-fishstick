<h1 align="center">ministic-fishstick</h1>

<p align="center">
  <img src="media/ministic-fishstick-readme-banner-800px.png" alt="Banner" width=650 />
</p>

<p align="center">Minimal, high-performance Model Context Protocol (MCP) server for semantic code indexing and vector search powered by <i>Tree-Sitter</i>, <i>Qdrant</i>, and <i>Bun/TypeScript</i>.</p>

`ministic-fishstick` extracts and enhances [Zoo Code](https://github.com/https://github.com/Zoo-Code-Org/Zoo-Code)'s code-indexing capabilities into a standalone MCP server that can be used directly with AI CLI agents (OpenCode, Claude Desktop, Cursor) as well as GitHub Copilot Agents in VS Code.

> [!IMPORTANT]
> This repository is now **deprecated** and **read-only**. Read below to discover why and what I learned about modern agentic development.

## Table of Contents

#### White Paper

- [Premise and Motivation](#premise-and-motivation)
- [Purpose and Planned Development](#purpose-and-planned-development)
- [Why Did I Stop Pursuing the Project?](#why-did-i-stop-pursuing-the-project)
- [So, What's the Solution?](#so-whats-the-solution)
  - [Projects Considered](#projects-considered)
  - [Runner Up](#runner-up)
  - [Chosen Candidate](#chosen-candidate)
- [Implementing a Graph-Driven Codebase Indexer](#implementing-a-graph-driven-codebase-indexer-its-more-than-just-installing-an-mcp)
- [A Note on Multi-Agentic Workflows](#a-note-on-multi-agentic-workflows)

#### Repository Guide

- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Local Setup](#installation--local-setup)
- [Usage](#usage)
  - [1. Running as an MCP Server (Stdio)](#1-running-as-an-mcp-server-stdio)
  - [2. Configuring in OpenCode / Claude Desktop / Cursor](#2-configuring-in-opencode--claude-desktop--cursor)
  - [3. VS Code Copilot Agent Integration](#3-vs-code-copilot-agent-integration)
  - [Available MCP Tools](#available-mcp-tools)
  - [Configuration Hierarchy](#configuration-hierarchy)
  - [Ignore Rules](#ignore-rules-fishignore--gitignore)
- [License](#license)
- [Credits](#credits)

## Premise and Motivation

Previously I was using [Zoo Code](https://github.com/Zoo-Code-Org/Zoo-Code) in VSCode for a research project that outgrew Google Colab. [Cline](https://github.com/cline/cline) was my entrypoint into agentic development, but I transitioned to Zoo Code because I felt like the harness was getting in the way of the model's reasoning ability. At first, Zoo Code was a major improvement. It handled all of my onerous tasks including adding docstrings, formatting new code, refactoring source code based on breaking changes I made, and generating small files or functions. Zoo Code also initially fulfilled my insistence on token conservation, and I was able to get a lot done with models like Google's `gemini-3-flash-preview` rather than pro-tier models or Claude's Opus.

As I learned more, I quickly transitioned my development workflow to an **agent-first** approach. I see my role now as a competent senior engineer that should be delegating non-research tasks to code agents that are *already code-context-aware*, and I should be reviewing the PRs that come from those tasks making edits where necessary. I find my agents produce the best code when I focus on enforcing overall codebase organization, design patterns, and runtime architecture. Consequently, I quickly outgrew Zoo Code. It was especially apparent when one night I tried to generate a library from scratch based on LaTeX, Markdown, and Python code I had already written. Zoo Code struggled with a task like this, making repeated API calls, choking on tool availability, and burning tokens; and after careful review, I wasn't convinced the model's reasoning ability nor my prompt engineering was to blame. It appeared the model was reasoning a response that didn't fit what Zoo Code expected in terms of tool selection. There was also a bug due to Google's recent enforcement in model turn lifecycle that helped prompt my move.

I switched to [OpenCode](https://github.com/anomalyco/opencode), and that same task was accomplished first try. You could argue that perhaps I could have put more effort into configuring Zoo Code, but switching to OpenCode has taught me a profound lesson — **the quality of the harness is just as important as the underlying reasoning model**. I'm comfortable in the command line, and I liked OpenCode's design philosophy, token conservation and transparency, and ease of configuration. I've been eyeing the [Pi Agent Harness](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) project because of its minimalist approach and congruence with my own developing belief that too many tools and MCPs is actually counter-productive in most agentic tasks and pollutes the context space, which my later research supported. But OpenCode provided ease of migration and an immediate platform for me to develop myself more.

The only problem was OpenCode lacked the Qdrant-based code indexer that was a big selling feature of Zoo Code for me. My preliminary research didn't find any real equivalent Qdrant-based indexer, and the projects that did didn't include the embedding model (Gemini's `text-embedder-001`) I was already using. I thought I had found a real gap in the open-source market, and since Zoo Code is Apache 2.0, I made a sparse fork of the repo and extracted the `code-index/` subpackage with OpenCode using `gemini-3.6-flash`, and `ministic-fishstick` was born.

The following is documentation of why my ambition was flawed and what I learned along the way. Hopefully, it helps someone else out there learn from my experiences.

## Purpose and Planned Development

My goal was to create a [modern MCP server](https://github.com/modelcontextprotocol/servers) for code workspace indexing using [`tree-sitter`](https://github.com/tree-sitter/tree-sitter) for AST structure, [Qdrant](https://github.com/qdrant/qdrant) for vector storage, and broad embedder model support. Most of the logic was already written by the Zoo Code team, so initially I thought all I had to do was wrap the [`code-index/`](https://github.com/Zoo-Code-Org/Zoo-Code/tree/e064cf0592cfc70735d86feff77f1265637697ae/src/services/code-index) subpackage in an MCP server, expose some tooling, and release it. I also planned to add Lean4 and Haskell support since my current research requires a Lean4 program for mathematical proofing of a custom density model I wrote, and Haskell was a natural extension. The project quickly grew in its refactoring effort as I removed telemetry for privacy, upgraded [Zod schemas to v4](https://zod.dev/api), changed Zoo Code's use of JSON-based caching with fragile file-locking to [Bun's SQLite](https://bun.com/docs/runtime/sqlite), completely refactored error handling and logging with [LogTape](https://github.com/dahlia/logtape) to protect stdio, and more.

Below is a list of features I implemented and planned to implement for a v1 release:

- 🚀 **Bun Native & Fast:** Built with Bun for fast runtime, built-in SQLite support, compilable binaries for release, and native TypeScript toolchain.
- 🗄️ **Modern MCP Server Design**: 
  - Uses the most up-to-date protocol using `@modelcontextprotocol/server` rather than the deprecated but more prevalent `sdk`.
  - Careful tool design to protect against destructive actions.
- 🔍 **Semantic Code Search with Remote Qdrant and Local Vector Database Options:**
  - **Local Zero-Docker SQLite Vector Store:** Used for caching and optionally for vector storage running locally without needing Docker or external database services.
  - **Qdrant Vector Store Support:** Maintains Zoo Code's Qdrant vector storage that was a big selling point for me.
  - **Local [Semble](https://github.com/MinishLab/semble) Embedding and Vector Store:** Maintains Zoo Code's optional local embedding model and vector storage.
- 🌳 **Tree-Sitter AST Parsing:**
  - Maintains Zoo Code's Tree-Sitter parsing logic that uses [`web-tree-sitter`](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web) and [`tree-sitter-wasms`](https://github.com/sourcegraph/tree-sitter-wasms), so code is indexed based on logical and scoped captures preventing functions from being separated from their definitions etc.
  - Extended to include [Lean4](https://github.com/wvhulle/tree-sitter-lean) and [Haskell](https://github.com/tree-sitter/tree-sitter-haskell) query logic and compiled WASMs not included in `tree-sitter-wasms`.
  - Corrected Scala query and a silent bug that used Lua as the query for Tree-Sitter parsing.
  - Maintains `sha256` file hashing and passive directory scanner and file-watcher to prevent stale queries.
- 🔌 **Broad Embedder Model Support:**
  - Maintained and updated Zoo Code's embedder model support and deprecated old models.
  - Fixed an authentication issue with Amazon's Bedrock.
  - Maintained support for local embedder model reasoning.
- 🛡️ **Smart Ignore Rules (`.fishignore` + `.gitignore`):** Respects both workspace `.gitignore` and `.fishignore` patterns to exclude sensitive files or build output.
- ⚙️ **Tiered Configuration System:** Resolves configuration seamlessly across runtime MCP tool overrides, workspace `.fishstick.json`, global `~/.config/fishstick/fishstick.json`, `.env` files, and defaults.
- 💻 **Command Line Support:** CLI for on-the-fly configuration and database management with protections against agentic usage with both a confirmation requirement and TLS inspection.
- 🪵 **Detailed Error Logging:** Uses `LogTape` that sinks all console info messages to a memory buffer and logs to a file in the event of an error or fatal exception.
- 🌐 **International Language Support:** Maintains Zoo Code's `i18next` support specifically for common fatal errors that would cause an MCP crash due to config errors, missing API keys, etc.
- 🤖 **VSCode & GitHub Copilot Integration Ready:** Includes a `vscode-extension/` wrapper exposing native VS Code MCP Server contributions (`contributes.mcpServers`) and Copilot LM tools.
- 🏠 **Local Defaults:**
  - **Zero Telemetry:** Removed Zoo Code's telemetry service.
  - **Embedding Provider:** Defaults to **OpenAI** using `text-embedding-3-small` (requires `OPENAI_API_KEY`).
  - **Vector Store:** Defaults to local zero-docker **`sqlite`** storage located at `<workspace>/.fishstick/vectors.sqlite`.
  - **Local Cache:** Incremental file scan hashes stored in `<workspace>/.fishstick/cache.sqlite`.
  - **Target Directory:** Indexes the current working directory (`process.cwd()`).

## Why Did I Stop Pursuing the Project?

> A good engineer knows when to use AI and when to use other tools.

I was researching `tree-sitter` parsing mechanics as I was completing my refactor of parsing bugs and extending the queries to include Lean4, Haskell, and Scala. I was unhappy with how Zoo Code didn't seem to leverage the queries it had defined in its parsing algorithm, and I was looking into improvements. It was here that I learned how the embedder model fits into the vector reasoning on both the read and write lifecycles, and I discovered that *I was conflating two distinct methods of search and indexing: __structural__ and __semantic__.*

__Structural__ searches are deterministic and provide *exact* results. You perform structural searches when you type in a function name in the search bar of VSCode. In the command line, structural searches are what tools like `grep` and `glob` perform. In both cases, the results are exact and based on regex string matches. Importantly, there is no *meaning* behind the search; there is no logical connection between two function implementations from an interface or similarity of function signature overloads or fuzzy matches of similar class names, for example. __Semantic__ searches are what give *meaning* to given search patterns. These search results are **not** deterministic and vary widely based on model inference of probabilistic proximity in vector space. Semantic searches are powerful in that they establish logical connections between things that are structurally unrelated but semantically related through the meaning of keywords, phrases, and surrounding context.

Crucially, *code is largely __structural__*. Using text embedding inference as a primary indexing and search method for code is like trying to find meaning from an acorn. Of course, you *could* write poetry about an acorn, sing songs about its journey falling from the tree, and infer meaning about its shape and design; but it would be hard and inefficient to perform a deterministic structural analysis saying "this acorn is a product of the function of this tree which is the output of the function of the roots that output nutrition and leaves that output energy, and the acorn functions as an object that can spawn another tree inheriting the same species definition in its DNA." Text embedded reasoning is good at finding code that's semantically similar; it's bad at representing structural relationships. A code relationship, "this function calls that function", *isn't a meaning* to be embedded; **it's a structural edge**, and flattening structure into a single point in vector space is a documented failure mode. CEO Guy Korland from FalkorDB described this best in his blog post ["Beyond Vector Search: Why a Code Graph Is the Secret to Chatting With Complex Codebases"](https://www.falkordb.com/blog/code-graph-is-the-secret/): 
> "A function's importance is defined by what calls it, what it calls, what it imports, and what it inherits from it. Embeddings flatten all of that into a single point in vector space, and 'near in vector space' is not 'connected in the call graph'. So the model fills the gap the way models do – confidently, and wrong."

Structural search problems such as "what calls a function" or "what would break if I change this" are **graph-traversal questions**. A graph already knows exactly what that is, where it is, and what references it, with perfect precision and zero inference. Semantic search problems, in contrast, ask "what does this component mean such that a differently-worded query would still reference it?" Embedder models excel in the legal and academic domains, for example, where cross referencing similar contract phrases and clauses or indexing topics across published papers or textbooks would truly benefit from the reasoning of an LLM. This process of semantic indexing and querying is more formally called Retrieval-Augmented Generation (RAG).

That's not to say that semantic searching is completely useless when applied to indexing and querying a codebase, but it solves a narrower problem. Its entire value proposition is *turn something ambiguous or unnamed into something findable by meaning*. That's powerful when the application is natural language — a docstring, a comment, or a commit message. It's much weaker when the application is bare syntax because syntax is already precisely specified; there's no ambiguity in `Point = Point { x :: Int, y :: Int }` that a vector needs to resolve. But **semantic searching does genuinely excel when applied to prompts like "_find me the sorting function_"**. Embedder reasoning adds actual value specifically for questions like these — fuzzy, natural-language, intent-based queries — which are a real but smaller slice of what a given agent actually queries. If someone prompts "find where authentication is checked before a request is processed," there's no symbol name to look up. This is a genuine *search by intent* problem, and it's where an embedding-reasoned first hop would be prudent before handing off to the graph for everything downstream of that first query answering "who calls it", "what does it depend on", and "what's its type signature". Indeed, AI researcher [Florian on Substack](https://aiexpjourney.substack.com/p/the-secret-behind-claude-codes-retrieval?utm_campaign=post-expanded-share&utm_medium=web) discussed the limits of pure structural search methods when concluding their reflection on Claude Code's source code leak and the code indexing architecture it revealed back in 1H2026:
> "Search results do not have the kind of semantic ranking a vector system could provide. Grep cannot find conceptually related code unless there is a matching token or pattern. LSP can fill some of that gap, but only when available and applicable. This means Claude Code’s approach is strongest when the task can be grounded in names, strings, paths, symbols, and concrete code evidence. It is weaker when the user asks a vague conceptual question and no obvious search terms exist."

Guy Korland from FalkorDB acknowledged this limitation in his [blog post](https://www.falkordb.com/blog/code-graph-is-the-secret/) and advocated for a hybrid approach, stating:
> "Vector search is excellent for semantic retrieval – 'find code that does something like X.' It’s the wrong tool for structural questions, where the answer is a path through the graph, not a similarity score. **The two are complementary**. Use embeddings to find a starting node by intent, then let the code graph walk the relationships from there. That hybrid is where the strongest codebase assistants land."

[Dean Rie](https://forum.cursor.com/t/code-index-fragment-association/160072/3), a Cursor developer, highlighted the challenges with RAG in Cursor's discussion board and gave a high-level architectural design pattern that echoes what the Cursor Team is working on, saying:
> "A few approaches are worth combining, since no single one is enough on its own:
>
> 1. Hybrid retrieval, not just vector. Vector search alone often misses calling and called functions because their embeddings can look far from the request. Combine it with keyword search or grep over symbol names. Cursor uses semantic search plus grep for this reason...
>
> 2. Build a code graph at the AST stage ... This is usually the most reliable approach. Build a symbol and call graph at parse time, including definitions, references, imports, and class hierarchy. Then at retrieval time, take top-k from vector search and do 1 to 2 hops of graph expansion, like callees, callers, and type dependencies. Tree-sitter plus a language-aware symbol resolver like LSP, scip indexers, or stack-graphs is what many production setups use.
>
> 3. Do recursive or static analysis on the fly ... It can work, but it’s slower and harder to cache. It’s usually best as a refinement step on a small candidate set, not as the main retrieval method.
>
> 4. Add a reranker on top. After vector plus graph expansion, run a cross-encoder or LLM rerank against the user request. This can greatly improve precision and helps when chunk boundaries aren’t great.
>
> 5. Chunking matters too. Function-level AST chunking is good, but for short helper functions or methods in the same class, grouping them or attaching class and file context to each chunk often helps.
>
> For Cursor’s indexing approach, the public part is here [(Semantic & Agentic Search | Cursor Docs)](https://cursor.com/docs/agent/tools/search)..."

Based on this research and the understanding it brought, I realized the core logic of what I was wrapping in an MCP server was architecturally incorrect. Improving agentic reasoning about a codebase and reducing costs by improving token efficiency **requires a graph** for most codebase queries, not AI. An embeddings model should be used where semantic searching would actually add more value, like reasoning intent-based prompts. Zoo Code's `code-index/` subpackage attempts to handle both through embedder reasoning alone, and that's architecturally inconsistent with what we've learned in the industry today. Moreover, this is a well-documented problem with numerous novel projects that attempt to solve it. My development time is better utilized by contributing to one of those projects, not reinventing my own unless I can propose a tertiary method. Indeed, what would have been my candidate proposal is already served by the following projects: [`sdsrss/code-graph-mcp`](https://github.com/sdsrss/code-graph-mcp) and [`DeusData/codebase-memory-mcp`](https://github.com/DeusData/codebase-memory-mcp). My reasoning is below.

## So, What's the Solution?

I contemplated several candidate open-source MCP projects, and before narrowing the list, my research pivoted to answering a refined question: **what design best offers modern coding agents efficient codebase context with _both_ structural and semantic insights?** As I learned more, I deduced this question into a set of requirements for a candidate project:

- **Should have minimal dependencies and written in a compiled language, preferably Rust.** This is personal preference. There are plenty or great projects written in TypeScript and Python, but I specifically wanted something *minimal*, as *least intrusive* on my system as possible, and *fast* at runtime. Personally, I prefer *Rust* or Golang since I find hacking at C/C++ laborious, but it wasn't a deal-breaker. But I did rule out anything that required a Docker container or a standalone DBMS server, like Memgraph or Neo4j. A single local binary with an embedded store was consistently preferred over anything needing separate infrastructure to function. This is a reflection of my own use-cases, but it's also resonant of a philosophy I'm developing — unless you're at the enterprise level indexing a codebase of thousands of files, code indexing should be a modular, minimal, and largely deterministic tool with semantic enhancements where appropriate.

- **Should have primary support for the core languages I write in.** AST support via Tree-Sitter and embedder reasoning can vary wildly depending on *how* the language is parsed, queried, chunked, and how the embedder model is trained. For example, I write dominantly in Python, Javascript/Typescript, Golang, and Rust. I also have experience in Lean4 and Swift, and I've spent quite a bit of time in Bash recently, but those 4 languages were my driving criteria. This might sound obvious, but not all embeddings models are trained equally and choosing a model that is code-specific but training on functional languages, for example, can lead to silent bugs that show up in inference quality.

- **Must include _both_ structural and semantic search capabilities.** This requirement is *constrained to reject projects that make embedder reasoning or RAG a primary feature* of their architecture. This is resonant of what I learned. A good engineer knows when to select the right tool, and the right tool features graph-based search mechanics in its core design philosophy and embedder reasoning as a secondary enhancement that handles the narrow use-case of semantic querying.

- **No LLM in the query/retrieval loop.** I penalized projects that attempted to translate natural language (NL) into queries via an LLM, like [`vitali87/code-graph-rag`](https://github.com/vitali87/code-graph-rag) which attempts to translate NL into Cypher via an LLM API call. I prioritized MCP servers that exposed deterministic tools directly to the calling agent. My reasoning is the calling agent itself *is* the reasoning layer, and there is no need for a second model mediating every lookup for my use-cases and scope.

- **Must use local SQLite for caching and database management.** It surprised me in my research that a dedicated graph DBMS isn't actually necessary for structural code indexing, but most useful code-navigation queries — find callers, find definition, list a file's symbols — are 1-3 hop traversals, which SQL handles fine with an adjacency-list table and a recursive CTE. A dedicated graph engine generally isn't needed unless the application requires deep multi-hop pathfinding or graph algorithms (community detection, centrality), which most agentic coding tools would never actually need. Thus, the strength of [Neo4j](https://neo4j.com/), perhaps the most well-known graph DBMS and written in Java, is needless for structural code indexing. [LadybugDB](https://github.com/LadybugDB/ladybug), the successor of KuzuDB before being acquired by Apple and often termed "the SQLite of graph databases", is written in C++ and more purpose-built for code indexing applications if the strength of a graph DBMS is required. [SurrealDB](https://github.com/surrealdb/surrealdb) is another great, purpose-built graph DBMS written in Rust. For local vector storage, I prioritized projecs that used the [`sqlite-vec`](https://github.com/asg017/sqlite-vec) extension which is an excellent project supported by Mozilla and SQLite Cloud.

- **Should not depend primarily on LSP servers.** This completely excluded the very popular [Serena](https://github.com/oraios/serena) MCP. The idea of using an LSP server is novel in that it leverages compiler/interpreter feedback and limited refactor capabilities, but I quickly developed two considerations that steered me away from these projects. First, it's contradictory to my minimalist value when it comes to tools like this. Serena adds a lot of dependencies and system weight that comes with the LSPs, and query responses no longer leverage the speed of a cached database but from a live server monitoring linting and code execution. It begged the question, "why not just use the LSP server directly?" Serena does add capabilities on top of a given LSP server, and the recent addition of the semantic search tool was a selling point. One could also make the argument that LSP-based querying is *exact*, *deterministic*, and eliminates the possibility of stale query results from a database or cache; but in comparison to other solutions, I wasn't convinced. The one use-case I have that would truly benefit from LSP-based queries is my development in Lean4, but that has an arguably much stronger MCP project ([`oOo0oOo/lean-lsp-mcp`](https://github.com/oOo0oOo/lean-lsp-mcp)) that wraps the Lean LSP and natively manages the complexity of the Lean language. For all the other dominant languages I write in, I preferred a graph-based project.

- **Should use incremental re-indexing, not full re-scans for stale index management.** Since I preferred a local database store and directly penalized LSP-based implementations, *how* the project indexed file changes was an important consideration. I favored indexing architectures that made the effort to perform content hashing and dirty propagation over anything that recomputes the whole graph on every change. This is a real scalability concern with $\mathcal{O}$ consequences. Let $n$ be the number of files in a codebase, $k$ be the number of file edits, and $d$ be the traversal complexity on the graph. Recomputing a full graph for every file edit requires $\mathcal{O}(n \cdot d)$ complexity. Compute complexity scales linearly with the number of files in the graph. You could make the argument that $d$ scales exponentially with the number of hops $h$ in the graph traversal, such that $d^h$, but most projects I encountered limited this with lazy resolution and marking downstream nodes dirty. Without these considerations, $h$ is very real. A Merkle differencing approach, however, produces complexity $\mathcal{O}(k \cdot d)$; thus, as the codebase scales with $n$, $k \ll n$ producing a linear speedup of $\frac{n}{k}$.

- **Read-only/analysis-first scope, not mandatory code-editing.** My whole purpose for building `ministic-fishstick` was to reduce my agents' need to use `grep`, `glob`, and read actions that needlessly burn tokens when codebase context can be represented more efficiently. Code refactoring and code generation, to me, is categorically a different task. Code formatting itself is solved at save-time with tools like [`prettier`](https://github.com/prettier/prettier). Beyond generating docstrings, an LLM is completely unnecessary for code style enforcement. Code editing and writing is better handled by other agentic capabilities; although, I did note that the inclusion of line number metadata in a query result was a powerful feature not seemingly included by many projects. 

- **Proportionate feature scope for a solo/personal-project use case.** I heavily discounted enterprise-oriented features like cross-repo graphs, IaC/K8s indexing, team-shared snapshot artifacts, and multi-service pub-sub tracing. I consistently used "do I need this?" as a filter against otherwise impressive feature lists. Scope in any context is crucial, and it is a documented phenomenon that just handing a model more tools is actually counter-productive (research on that below).

- **Maturity/competence signal from direct code review, not just star count.** I admire indie projects, and I didn't treat GitHub stars as sufficient evidence for the integrity or maturity of a candidate project. This is where GitHub's Copilot is an absolute game changer. I personally audited the codebases of my shortlist both through Copilot's help and manual review of pertinent code for security considerations, configurability, and adherence to my requirements before trusting the maintainer's claims. There are some great projects out there, and Copilot has transformed my project discovery.

- **Must have verifiable integrity for anything fetched over the network.** This criterion mattered more for the indie projects I considered. For me, the smaller a project, the more privacy focus it should become. Larger projects tend to carry an "enterprise-grade hardening" that precludes (but doesn't eliminate) many security concerns just by virtue of the number of eyeballs that have reviewed and used the project. For the indie projects, I was especially scrutinous of any telemetry, outbound requests, and applicable cryptographic and security management if exposing or interfacing with an API.

### Projects Considered
This is a short summary of the main codebase indexing MCP projects I considered, but it is not exhaustive. The list is relevant as of August 2026. Please consider giving these projects your support if they're applicable to you:

- [`Jakedismo/codegraph-rust`](https://github.com/Jakedismo/codegraph-rust): An awesome project written in Rust that implements [SurrealDB](https://github.com/surrealdb/surrealdb) and uses both structural and semantic search, but it violated my criteria on in-the-loop reasoning (Rig-based agentic tools) and minimalism. This would be my go-to project, however, if I needed the muscle of a dedicated graph-based backend.

- [Serena](https://github.com/oraios/serena): This was my initial benchmark as my research evolved. It's a mature, widely-adopted toolkit, and it offers limited refactoring (rename, move, inline) above just wrapping an LSP server. But, it violated my criteria on minimalism (each language needs its own LSP binary installed) and my preference for a local cache and graph store. The one application that would seriously benefit from an LSP server is my current research with Lean4, and [`oOo0oOo/lean-lsp-mcp`](https://github.com/oOo0oOo/lean-lsp-mcp) already handles that.

- [CodeGraphContext](https://github.com/codegraphcontext/codegraphcontext): A mature, well-adopted Python project that focuses purely on structural graph-based indexing and gives a choice to use [LadybugDB](https://github.com/LadybugDB/ladybug), FalkorDB Lite, or Neo4j as the database backend. This is honestly a great project, but it violates my criteria on minimalism, language preference, and it lackes a semantic search enhancement.

- [`cocoindex-io/cocoindex-code`](https://github.com/cocoindex-io/cocoindex-code): A lightweight, well-built semantic search tool built on the Rust-based CocoIndex data transformation engine, but it isn't a knowledge graph at all. Like Zoo Code, its AST implementation is used only to produce cleaner chunk boundaries for embedder-driven search. It violated my core requirement that graph-based search be primary and embedder reasoning be a secondary enhancement.

- [`vitali87/code-graph-rag`](https://github.com/vitali87/code-graph-rag): An ambitious graph-RAG system written in Python that translates natural language into Cypher via an LLM and requires Docker plus a Memgraph instance to run. It violated my criteria on heavy external dependencies (Memgraph/Docker), in-the-loop reasoning (LLM-mediated queries instead of deterministic tool calls), and I didn't care for its incremental indexing methodology that recomputes all call-graph edges on every file change rather than propagating only the diff.

- [`websines/codegraph-mcp`](https://github.com/websines/codegraph-mcp): An interesting indie project in Rust built by a self-proclaimed AI consultant. It uses tree-sitter for AST supporting Python, Go, Rust, and JavaScript/Typescript only, [`petgraph`](https://github.com/petgraph/petgraph) for graph data structuring, and sqlite for the DBMS. The repo's organization is very clean, and it has all the basic components of a well-structured pure graph-based indexer; however, the project fundamentally solves a different problem. It leverages graph-based indexing for structural search but combines it with persistent context memory. This was a novel approach to me; rather than combine an embeddings model with a vector store to offer an agent semantic search capabilities, `websines/codegraph-mcp` went the other direction by becoming a context sink. Unfortunately, I wasn't convinced of the project's querying method; I had concerns about context management; and it appeared that the project was more of a learning experience and portfolio-builder for the author. But, I included it because I liked how orthogonal its approach was compared to everything else I surveyed.

### Runner Up
**[`DeusData/codebase-memory-mcp`](https://github.com/DeusData/codebase-memory-mcp)**

I *strongly* considered this project. It's based on academic research published on March 28, 2026, titled [Codebase-Memory: Tree-Sitter-Based Knowledge Graphs for LLM Code Exploration via MCP](https://doi.org/10.48550/arXiv.2603.27277) ([PDF](https://arxiv.org/pdf/2603.27277)), and directly addresses the emerging challenges of codebase context. This paper was an inspiration for me, and the open-source project it spawned was equally intriguing:

#### What I liked
- **Core focus on security.** An 8-layer CI audit runs on every commit including a static allow-list rejecting dangerous libc calls (`system`, `popen`, `fork`, `execvp`), binary string scanning for hardcoded URLs and embedded credentials, live `strace` network-egress monitoring restricted to localhost/DNS/GitHub, sandboxed install-path validation blocking writes to `~/.ssh`, `~/.gnupg`, and `~/.aws`, and 23 adversarial JSON-RPC payloads specifically testing SQL injection, shell injection, path traversal, and ReDoS against the MCP server itself. Every test build runs under a sanitizer with a 15-minute memory-safety soak test. I didn't see this level of scrutiny in any other project I surveyed.

- **Real performance at scale with local SQLite and incremental indexing.** The project indexes to the RAM first which results in impressive speeds claiming to index the entire Linux kernel (28M LOC, 75K files) in 3 minutes with sub-millisecond queries thereafter. It employs incremental indexing to a local SQLite store based on file hashes and differencing. These stores can be compressed via `zstd` and shared as an artifact between teams. The project also boasts a 99.2% token reduction on benchmark queries (~3,400 tokens vs. ~412,000 for `grep`/read).

- **Pefromance transparency and evidence-driven design.** The paper behind this project doesn't oversell. It reports its own graph agent *losing* to plain file exploration on raw answer quality across 31 real repositories and identifies culpable design weakenesses including macro-heavy C, full-source-context tasks, and exhaustive `grep`. The willingness to publish its own failure modes with scientific clarity at that level of granularity frankly earned my trust. Many of these limitations are being addressed in the resulting project.

- **Genuinely useful MCP tools beyond the core graph.** The project features a Cypher-subset query language (`query_graph`) for ad hoc structural questions beyond the fixed tool surface. The tool `detect_changes` maps live git diffs directly to affected symbols with risk classification. Notably, this project does *not* use LLMs for NL-to-Cypher translation. The MCP itself handles that translation internally.

- **Semantic search enhancement included with impressive query scoring.** The project goes beyond the design of the paper to include semantic search capabilities via the [`nomic-embed-code`](https://huggingface.co/nomic-ai/nomic-embed-code) embeddings model. The reasoning and vector storage pipeline process is entirely local and compiled into the binary. It uses a custom 11-signal combined graph-vector query scoring method rather than the standard cosine method or Reciprocal Rank Fusion (RRF) scoring. For example, if two functions have identical semantic vector scores based on a prompt, the 11-signal scoring method intervenes by boosting a function that is heavily referenced and sits at the center of the graph while demoting an isolated, unreferenced utility function.

- **Awesome 3D graph visualization of your codebase.** Seeing this feature was a real wow factor for me.

#### What kept me away
- **Enterprise-level tools outside of my scope and contradictory to my minimalist preference.** The project is definitely oriented towards large codebase applications and includes features like cross-repo querying, infrastructure-as-code indexing (Dockerfiles, Kubernetes manifests as graph nodes), and multi-service pub-sub tracing across gRPC/GraphQL/Socket.IO. These features are contradictory to my *minimalist* requirement. The project itself is huge, implements a persistent session coordination daemon, and features a hybrid implementation of an LSP per language. I kept asking myself "do I actually need this?", and for a solo research project, the answer was consistently no.

- **Core library still under development.** Despite robust support, the project is still early-stage, and the commit history shows real pipeline churn in core mechanics.

- **Potentially limited embedder reasoning quality.** The project uses [`nomic-embed-code`](https://huggingface.co/nomic-ai/nomic-embed-code) for embedder reasoning, which supports Python, Java, Ruby, PHP, JavaScript, and Go. The fact that the embedder was code-specific in its training was a complicated plus. I'm about to spend significant time in Rust, so its absence from the core training set was a real drawback for me. All of the training languages are heavily imperative. While Rust also has an imperative core, it leans more heavily into functional-style abstractions and enforces immutability and ownership constraints that the training languages don't feature and could affect semantic retrieval quality.

### Chosen Candidate
**[`sdsrss/code-graph-mcp`](https://github.com/sdsrss/code-graph-mcp)**

#### What I liked
- **Developed by obvious competence.** The project is indie and clearly vibe-coded with Claude, but by someone clearly seasoned in backend development. The codebase is slightly disorganized but there is abundant audit, changelog, and code architecture documentation. The audits are genuinely impressive. An agent can generate code, but it requires sophisticated prompt engineering from a developer experienced in the domain to specify design intentions like BLAKE3 Merkle-tree dirty propagation, CTE call-graph traversal for SQLite over a full graph DBMS, HTTP route tracing across frameworks, and RRF scoring for a completely optional vector-based search feature. The project is still in active development but the changelog is quieter on the core execution logic.

- **Intentionally minimal and optional embedder reasoning.** Written in Rust with tooling in JavaScript and auditing/benchmarking in Python. SQLite and [`sqlite-vec`](https://github.com/asg017/sqlite-vec) are used for the cache, graph store, and vector store, all local and `sqlite-vec` is pinned to the repo directly making the project genuinely zero-dependency at runtime. The embedder model is also entirely local, based on [HuggingFace's Candle](https://github.com/huggingface/candle) library in Rust, and the feature itself is optional meaning the project can reduce to a purely graph-based FTS5-only indexer. The embedder feature is loaded lazily, so the project binary reduces to mearly 10MB without it at build-time.

- **Impressive structural and semantic search scoring methods.** For structural searches, [`sqlite` with FTS5](https://www.sqlite.org/fts5.html) is carefully configured with tokenization, stopword guards, phrase-quoting to avoid silent metachar injection bugs, etc. Search results are scored via BM25 keyword ranking combined with vector similarity through Reciprocal Rank Fusion (RRF). The default embedder model is [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), but audits have been performed on code-specific variants that are selectable via environment variable including [`nomic-ai/CodeRankEmbed`](https://huggingface.co/nomic-ai/CodeRankEmbed) and [`minishlab/potion-code-16M`](https://huggingface.co/minishlab/potion-code-16M).

- **Impressive AST parsing.** AST is tree-sitter based and chunking has dedicated Rust modules *per supported language* rather than just an `.scm` query file.

- **Incremental indexing with explicit care for edge cases.** The project employs BLAKE3 file hashing throughout instead of SHA-256, which I saw in most other projects. Index updates are represented as Merkle diffs, using dirty propagation that lazily marks downstream nodes. Re-indexing cost is proportional to the size of the edit leveraging $\mathcal{O}(k \cdot d)$ optimization, and the project even employs self-healing logic for SQLite corruption edge cases.

- **HTTP route tracing.** Given that I do spend time setting up cloud-based applications, this was a unique feature I didn't see in most of the other projects I surveyed.

- **Impressive audits and acknowledgements of design fragilities.** This was unique for the indie projects I reviewed and heavily modeled the scientific transparency the `DeusData/codebase-memory-mcp` project had. The audits were honest that there is a small TOCTOU (Time-of-Check to Time-of-Use) window when vectors are inserted, but mitigations such as existence checks and orphan handling are in place. There's also an index scanner blindness edge case where diffs that propogate within the same tick can be missed causing slight index lag. Given the transparency and the fact that these audits were performed with prompt intention from the author, I viewed these issues as planned improvements and neither were critical. Like `DeusData/codebase-memory-mcp`, the scientific transparency earned my trust.

- **Active development that addresses audit findings.** The project is currently receiving weekly attention from the author with significant updates. At the time of writing (17 Aug 2026), the project was updated to v0.120.1 from v0.117.0 four days prior and brought a CLI overhaul that now separates commands per module for maintainability, new drift guards when scanning the file tree, improved search result accuracy that reduces false positives, and new test suite hardening.

- **Solid code integrity.** Before considering adoption, I specifically evaluated the repo for security considerations. There is zero telemetry logic, TLS is enforced for HTTP requests, BLAKE3 checksums are computed for downloaded release artifacts including embedder model weights and sqlite, and there's even invalid input rejection logic.

## Implementing a Graph-Driven Codebase Indexer (It's more than just installing an MCP)

The biggest thing I learned throughout this process was how important each component of agentic development is. The harness itself, exemplified by my own experiences with Cline and Zoo Code, can amplify or degrade a given model's reasoning ability. Harness-level permissions, configuration, and middleware can distort a given model's contextual reality and permit deference to its trained bias or enforce desired reasoning character. Moreover, the design of an MCP server and the number and quality of included tools can pollute model context or make it highly efficient. One should think about model context like the quality of an image. The more tools, the more MCP servers, the more modifications applied to the context, the blurrier the image, and the less resolution a given model "sees".

My research yielded the following design considerations when configuring agentic software:

- **Avoid tools that distort the context.** In my research, I also looked at tools that filter or compress raw command output before it reaches the model, like [`rtk-ai/rtk`](https://github.com/rtk-ai/rtk), which advertises 60–90% token savings on shell output. On the surface, it seems like an incredible upgrade for the harness, but [JetBrains](https://blog.jetbrains.com/ai/2026/07/rtk-claude-code-token-savings/) ran a rigorous benchmark against it and discovered the opposite: a median +7.6% cost increase at low reasoning effort (p=0.004) and a flat +0.1% at high effort, never saving, because most of what an agent reads bypasses the hook entirely. Two factors drive this issue. First, a writeup from [Abhishek Ray on Claude Code Camp](https://www.claudecodecamp.com/p/how-prompt-caching-actually-works-in-claude-code) highlights the consequences to cached context savings, stating, "*Adding one MCP tool changes the prefix, which invalidates the cache for the entire conversation history*". This directly applies to tools like `rtk-ai/rtk` which can dynamically change the structure of bash command outputs, directly resulting in lost context cache cost savings. Second, aggressive command output compression can cause model confusion. Benchmarks show that when agents get confused by truncated outputs, output quality might not materially suffer, but they run 20% to 30% more total commands. An [open GitHub issue](https://github.com/rtk-ai/rtk/issues/2104#issue-4524950354) on `rtk-ai/rtk` articulates this concern well:
  > "RTK's strategies (removing comments, whitespace, boilerplate; grouping similar items; truncating; deduplication) are well-designed for reducing noise. But noise and signal are context-dependent — what looks like 'boilerplate' to a filter might be the exact pattern the model needs to recognize for understanding a project's architecture. What gets truncated as 'redundancy' might contain the subtle details that differentiate one bug from another."

  But, I would go further and propose that model training bias is also a fundamental factor here. Much of what `rtk-ai/rtk` does is dynamic, not deterministic, which means console outputs are not truncated the same way each call. Not only does this defeat the purpose of context caching on the hyperscalers end, but the model has a new layer of complexity to reason through *because the command output it sees doesn't match the command outputs it was trained to see*.

  Consequently, I directly rejected tools like this in my research and instead preferred tools that offered determinism in the context they truncate. As the author of the [open issue](https://github.com/rtk-ai/rtk/issues/2104#issue-4524950354) on `rtk-ai/rtk`'s GitHub commented, 
  > "I don't think the answer is simply 'more context = always better' — context window limits are real, and token costs matter. But the solution space between 'raw dump everything' and 'aggressively filter everything' is wide..." 
  
  For me, I chose to answer this question with tools like graph-based indexing and semantic search enhancements rather than directly modifying pertinent bash commands I allow the model to use (more in following points).

- **Enforce desired agent behavior through configuration.** Passively suggesting to the model that it *should* use "better" tools for `grep` and read actions by just installing an MCP is *not* viable. The `sdsrss/code-graph-mcp` project discovered this in its own audit history with *brutal* results. Over a week of real usage across 751 edits, 683 reads, and 472 greps, passively recommending the `sdsrss/code-graph-mcp` tools, even embedding hints directly in denial messages, measured a **0/40 transfer rate**. In other words, **no one**, not even `sdsrss`'s own coding agent, **ever** voluntarily reached for the MCP tool when `grep` was available. Presenting a well-designed, well-described tool changes absolutely nothing when the harness itself is biased toward `grep` at its reinforcement level.

  But even after enforcing the model to actually use the installed tools, harness architecture and search result delivery method are equally crucial. In the published paper "[Is Grep All You Need? How Agent Harnesses Reshape Agentic Search](https://doi.org/10.48550/arXiv.2605.15184)", the authors perform experiments on conversation text retrieval comparing lexical and semantic methods. What they discover, agnostic of their experiment medium, is harness architecture and the delivery method of the result matter more than the retrieval algorithm alone. One experiment found the *same model* scored 93.1% under one harness's inline delivery method but 55.2% under a different harness's file-based delivery method for identical retrieval algorithms. The Model Context Protocol is itself inline through stdio, but the authors' findings emphasize the importance of harness architecture and configuration.

  The solution has three components:

  1. **The harness must be configured to prohibit certain Bash commands when alternatives are intentionally available.** Of course, using a less-biased, more reinforcement-configurable harness like OpenCode or Pi is preferred, but not always convenient or desirable. But agnostic of harness selection, it's crucial to explicitly prohibit certain commands at harness-level configuration, for example in an `opencode.json`:
  ```json
  {
    "permission": {
      "bash": {
        "*": "allow",
        "grep *": "deny",
        "rg *": "deny",
        "find * -name*": "deny",
        "rm *" : "deny",
        "git *": "allow",
        "./scripts/*": "allow"
      },
      "edit": "allow",
      "webfetch": "deny"
    }
  }
  ```

  2. **Desired model behavior should be concisely and declaratively described in AGENTS.md.** There's a really good blog post from earlier this year by [Blake Crosley](https://blakecrosley.com/blog/agents-md-patterns) that guides on how to properly structure and command agents in your `AGENTS.md` file. Blake advocates for being declarative and command-oriented in `AGENTS.md`, saying:
  > "*Most AGENTS.md problems come from writing human documentation instead of agent operations.* Effective files are command-first (exact invocations, not descriptions), task-organized (coding, review, release sections), and closure-defined (explicit 'done' criteria). Anti-patterns that reliably get ignored: prose paragraphs, ambiguous directives ('be careful'), and contradictory priorities." (emphasis added)

  In the context of enforcing agentic usage of an indexer MCP over command tools, an `AGENTS.md` might contain the following:
  ```markdown
  ## STRICT COMMAND PROHIBITIONS
  You are BARRED from using these Bash commands: `grep`, `rg`, `find`, `glob`.

  When you need to locate a symbol, definition, or call site, invoke the MCP tool instead:
  - Find a definition: `ast_search(symbol: string)`
  - Find all callers: `find_references(symbol: string)`
  - Search by concept/intent: `semantic_code_search(query: string)`

  If a required MCP tool call fails or returns empty, retry once with a corrected argument.
  ```

  3. **Modify the shell process directly to enforce prohibitions and redirect behavior.** It is a documented phenomenon that sometimes the model can disobey the coercion of the harness and attempt to use prohibited command tools like `grep` anyway. The current hypothesis for this, which I also share, lies in model training bias. Sometimes the model can reason `grep` as a "path of least resistance" to get what it needs even though other tools are available and arguably better for the task. The solution is to hard disable prohibited tools like `grep` within the agent's execution process with feedback. The best method I've found is to use a shell script that spawns a process with the harness CLI that inherits command overrides, environment variables, and avoids `alias` in favor of `export` so configuration propagates to child processes. Here's an example script that targets OpenCode with `sdsrss/code-graph-mcp` installed and authenticates with GCP for Agent Platform models (formerly VertexAI):
  ```bash
  #!/usr/bin/env bash
  # my-harness-wrapper.sh
  #
  # Spawns the coding-agent harness (OpenCode, in this example) with
  # Bash-level command overrides scoped to this process tree only.
  # Overrides do not persist in the parent shell or in unrelated sessions.
  #
  # Usage:
  #   ./my-harness-wrapper.sh [any args to pass through to the harness]
  #
  # Suggested alias for convenience (put in your interactive shell config):
  #   alias oc-wrapper='/path/to/my-harness-wrapper.sh'

  set -euo pipefail

  grep() {
    echo "ERROR: grep is disabled in this session. Use the code-graph-mcp search tools instead (e.g., ast_search)." >&2
    return 1
  }

  rg() {
    echo "ERROR: rg is disabled in this session. Use the code-graph-mcp search tools instead (e.g. ast_search)." >&2
    return 1
  }

  find() {
    echo "ERROR: find is disabled in this session. Use the code-graph-mcp ast_search tool instead." >&2
    return 1
  }

  export -f grep
  export -f rg
  export -f find

  # Environment/credentials for the harness process, scoped the same way
  # as the overrides above -- adjust to your actual GCP/Vertex setup.
  export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-/run/secrets/<your-sa-credential>.json}"
  export GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-<your-project-id>}"
  export GOOGLE_VERTEX_LOCATION="${GOOGLE_VERTEX_LOCATION:-global}"

  # exec replaces this script's process with the harness, preserving the
  # exported functions and env vars in the harness's process tree without
  # leaving a lingering wrapper process behind.
  exec opencode "$@"
  ```

  **Note:** This is a great way to coerce the model to use the desired MCP tools, but it's not foolproof. The model can still technically attempt to access prohibited bash commands through the command's absolute path.

- **Minimalism and modularity yields performance.** Perhaps the most important concept to understand about agentic performance is every tool, every skill, and every word added to the `AGENTS.md` file *directly grows model context before a given user prompt is even reasoned*. This is crucial to digest. Minimalism isn't just a preference when it comes to designing code agents. **Context management** can be more crucial than engineering the prompt itself.

  [Microsoft Research](https://www.microsoft.com/en-us/research/video/tool-space-interference-an-emerging-problem-for-llm-agents/) calls reasoning degradation applied to MCP tool declarations and description context "Tool-Space Interference". Imagine model context like a commercial kitchen. The tool-space are all of the knives, pots, pans, peelers, etc. Consider the knives hanging on the wall. Imagine that there are 100 of them all of different shape, size, and form. You can agree that a paring knife is ideal for detailed tasks like trimming fat from meat or peeling a fruit, but a Japanese Santoku would be far more ideal for chopping vegetables. But among the 100+ knives on the wall, you can't readily make that assessment and neither can the model. Instead, anyone with that kind of overwhelm would reach for a standard chef's knife and ignore the rest of the tool options. Models do the same, or worse, become temporarily paralyzed and burn tokens.

  [In their study of 1,470 MCP servers](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/), Microsoft found that tool-space interference issues manifested most heavily when MCP servers exposed too many tools but also in other areas like tool naming collisions and vague or lengthy tool descriptions. During research on LLM degradation of long-running workflow delegation that involved long-document editing, Microsoft Research, in the paper ["LLMs Corrupt Your Documents When You Delegate"](https://doi.org/10.48550/arXiv.2604.15597), discovered that adding a specific document read and editing tool degraded model performance by a marginal addition of 6%. The issue wasn't the inclusion of the tool so much as it was the additional tool-space inference overhead the tool addition required in an already heavy context. As the authors note, models "invoke 8-12 tools on average to complete a task," and their simulations with tools available consumed "2-5x more input tokens than the no-tool alternative."
  
  In ["Understanding LLM Performance Degradation in Multi-Instance Processing: The Roles of Instance Count and Context Length"](https://doi.org/10.48550/arXiv.2603.22608) the authors observe model performance degradation directly when context instances (of which MCP tool invocations could be considered a subset thereof) grew beyond 20. Performance collapsed when instance count exceeded 100. Research from Stanford and UC Berkeley may offer one explanation for this behavior. In their paper ["Lost in the Middle: How Language Models Use Long Contexts"](https://doi.org/10.48550/arXiv.2307.03172), the authors expose a very obvious U-shaped performance curve when LLMs were tasked with retrieving information from a given context. Their findings showed LLMs exhibit profound primacy and recency bias with performance peaking when retrieved information was located at the start or end of the context window. Models engineered with massive context windows were not immune to this phenomenon. Encoder-decoder models were more robust, but there was a limit when context length exceeded training sequence length causing the U-shaped performance curve to reappear.

  Adding irrelevant tools and skills to an agent's tool-space is an equally severe culprit. In the paper ["The Tool-Overuse Illusion: Why Does LLM Prefer External Tools over Internal Knowledge?"](https://doi.org/10.48550/arXiv.2604.19749), the authors show that when irrelevant tools are offered to agents "the model hallucinates tool capabilities to compensate for [its own] reasoning gaps" yielding "no informational gain and further increases context burden." There are compounding $\mathcal{O}$ consequences to this because the act of invoking these irrelevant tools appends the result directly to the context stack. In the authors' experiments, frontier models were found to spuriously invoke irrelevant tools 19.8% of the time, rising to 37.5% for open-source models, when no tool is relevant to the query. There are profound accuracy consequences too as the authors observed, "enabling tool use leads to a 3.29-14.48% drop in accuracy on questions solvable using internal knowledge alone."

  The solution is to be cognizant of context growth and integrity when designing an agent with MCP tools, a new skill, or lengthy instructions in the `AGENTS.md`. Agents should be modular and their tool-space purposeful. The team at [Microsoft Research](https://www.microsoft.com/en-us/research/blog/tool-space-interference-in-the-mcp-era-designing-for-agent-compatibility-at-scale/) recommends MCP servers to "expose as few tools as possible, have short tool responses, [with] unique and descriptive tool names," and they built [`microsoft/mcp-interviewer`](https://github.com/microsoft/mcp-interviewer/) to help guide MCP quality. OpenAI recommends *at most* 20 tools per agent, and both [Cursor](https://cursor.com/blog/dynamic-context-discovery) and [Anthropic](https://www.anthropic.com/engineering/advanced-tool-use) are implementing *dynamic tool relevance* in their harnesses, injecting the 3 to 5 most relevant tools into the active system prompt often achieving a 10% maximum impact to the target context window.
  
  Remember, **context is not free** and agents don't "draw from" context passively. Context is a scarce, ordered, and finite budget that every tool declaration, every skill, and every instruction spends before a prompt is even considered. A codebase-indexing MCP that exposes a dozen narrowly-scoped, deterministic tools with tight, unambiguous descriptions is far more performant than a "kitchen-sink" approach with numerous, general-purpose, similarly named tools expecting the model will simply select the best tool for a given query. Ultimately, it was the driving intuition that made me step away from Zoo Code; and given the research, it was a defining principle that ruled out several of the candidate projects I considered. I rejected many projects not because they were poorly built but because *tool breadth and generality are not free*, and every capability bundled into an agent's tool-space is a withdrawal against the same limited context budget.

## A Note on Multi-Agentic Workflows

At its core, an **agent** is a *configuration* of a given harness, its interaction with a given model, the tools it makes available (through MCP servers or otherwise), and the context it manages. Of course, "multi-agent" came up in my research as the industry pushed heavily toward multi-agentic harnesses in late 2Q2026. Google was perhaps the most visible proponent of the industry's push in May 2026, [nearly deprecating](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/) the [Gemini CLI](https://geminicli.com/) for consumers (with continued open-source support and updates for GCP customers) and heavily marketing [Antigravity](https://antigravity.google/). In their [announcement](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/), Google stated:
> "Gemini CLI proved the terminal could be an incredible interface for agentic tasks, but your needs shifted. You now require multiple agents communicating with each other to split up the work and solve complex problems."

The answer is actually far more nuanced. In the Stanford paper ["Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking Token Budgets"](https://doi.org/10.48550/arXiv.2604.02460), the authors showed that when normalizing for compute single-agent architectures "consistently match or outperform" multi-agent and demonstrate that multi-agent performance improvements depend on token budget, context degradation level, model capability, and task difficulty. Indeed, [Anthropic demonstrated](https://www.anthropic.com/engineering/multi-agent-research-system) that multiple Sonnet 4 subagents spawned from an Opus 4 parent yielded a 90.2% performance improvement over a single Opus 4 execution. While impressive, the driving reason for the performance gain was equally concerning:
> "Multi-agent systems work mainly because they help spend enough tokens to solve the problem. ... We found that token usage by itself explains 80% of the variance, with the number of tool calls and the model choice as the two other explanatory factors. ... [I]n practice, these architectures burn through tokens fast. In our data, agents typically use about 4x more tokens than chat interactions, and multi-agent systems use about 15x more tokens than chats. For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance."

But while it might sound like multi-agents excel at accomplishing complex problems that require *scale*, there are still limits. Researchers at Fudan University, in their paper ["Scaling Behavior of Single LLM-Driven Multi-Agent Systems"](https://doi.org/10.48550/arXiv.2606.00655), showed that performance gains do not scale monotonically with agent count, and in fact result in diminishing returns due to the competition between "collaborative synergy and coordination overhead". That "coordination overhead" comment should sound familiar; in fact, both of these competing phenomena are direct references to *context engineering*. When a subagent is spawned, it requires its own configuration which involves its own model interaction, its own tools, its own harness permissions, and, importantly, *its own context*. Managing multiple contexts and making them available such that it's accessible to the parent agent without context overflow or introducing the [Lost in the Middle](https://doi.org/10.48550/arXiv.2307.03172) problem is its own challenge. The [Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system) team handles this by persisting each subagent's output to the filesystem, but the careful reader will realize this introduces challenges around context retrieval including architectural questions around structural and semantic querying.

And, what if the context between subagents largely overlaps for the given task? You're just burning more tokens, and, crucially, you're requiring the parent agent to perform orchestration. The overhead that orchestration creates is *not* trivial. [Anthropic highlights](https://www.anthropic.com/engineering/multi-agent-research-system) the challenges orchestration architecture alone can create:
> "Currently, our lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks in the information flow between agents. For instance, the lead agent can’t steer subagents, subagents can’t coordinate, and the entire system can be blocked while waiting for a single subagent to finish searching. Asynchronous execution would enable additional parallelism: agents working concurrently and creating new subagents when needed. But this asynchronicity adds challenges in result coordination, state consistency, and error propagation across the subagents."

*Who — or what — is responsible* for that orchestration is another layer of challenges. On the one hand, one might assume that the parent agent's model can reason through that orchestration and spawn subagents on its own. But as we learned above, agents, like an amateur cook overwhelmed by all the knife options on the wall of a commercial kitchen, bias toward implementing the task themselves often ignoring the availability of subagents as a tool entirely. On the other hand, we could move that orchestration complexity to the harness, away from the model, but this presents a new challenge. What criteria do you codify into the harness to spawn the subagent, and how is its lifecycle managed? That's a non-trivial development conundrum, and there isn't really a middle-ground. Any criteria sophisticated enough for a harness to correctly detect "this subtask is parallel and independent" is itself a semantic judgment about task structure, and we learned above that *semantic* inquiries are the ones that benefit from LLM reasoning. Thus, all we've done is relocate orchestration reasoning from inside the loop to outside it with a classifier model deciding task routing, and we incurred the additional complexity of context orchestration, classifier training, and maintenance along with it.

The solution the industry has presently settled on is to spawn subagents based on task breadth and parallelism. For example, consider a deep research task that requires a review of several different published papers in a database on a given topic. This is where multi-agent architectures add real value because the context of each reviewed paper is genuinely parallel and can be assigned to a parallel subagent.

In the context of MCP servers and codebase indexing, multi-agent architectures are generally **never** the right tool for search. Structural queries like "what references this function" are single-agent tasks, and we've established that the appropriate tool is a graph-based index of the codebase rather than `grep` or read tools. Indeed, semantic queries like "find where authentication is checked before the request is processed" are also single-agent tasks that can leverage an embeddings model to reason intent and return semantically similar code segments from vector space before attempting a structural query.

Consider the following prompt: "make sure error handling is consistent across the auth, billing, and notification modules." A graph index can trivially locate each module's code, but you could argue that the semantic reasoning required to ensure "consistent" error handling across all three modules is a case for spawning a subagent on each module, similar to the deep research example above. I'd argue caution. Remember, **context management is perhaps the most important driver of model performance**, and the implied tradeoff to using multiple agents for this prompt involves a potential *degradation in context coherence* and *increased token expenditure* for demonstrably *marginal performance gain*. Most often, the answer is to use a single, well-designed agent with specific, intentional tools. Just because the task is parallelizable doesn't automatically mean multi-agent is the right approach. As a general rule, only when task breadth grows to the point that the context is both parallelizable and large enough that the ["Lost in the Middle"](https://doi.org/10.48550/arXiv.2307.03172) problem would emerge do multi-agent architectures add real value.

### Aside

If this sounds complicated, it is. Artificial intelligence as an industry and what we've learned as a community of engineers has moved at a breath-taking pace. As traditional development transforms more and more into PR reviews, codebase orchestration, and project management of agentic output, I believe "**agentic development**" — prompt engineering, context engineering, and harness configuration — will become a core skillset for current and future engineers. There is no perfect harness, no perfect method of managing context, and no perfect agent configuration that applies to all tasks. If you don't have one, I strongly recommend setting up your own "dotfiles" repository. The term "dotfiles" gets its name from the shell scripts and configuration files that start with a dot that engineers have historically stored in, often personal, repositories. The idea is you can go to any environment, clone the repo, run a couple of custom setup scripts, and instantly you have all your tools at your disposal.

This project and the research it instigated has made apparent the importance of my own dotfiles repo. Of course, I put configuration files, hyperscaler resource provisioning scripts, and my own custom scripts that setup my bash environment in there, but now I'm adding agentic development files. Crucially, given the speed the industry is moving, I recommend having a directory called `agents/` with a subdirectory for each agent you design. In that subdirectory, put everything you need to setup the agent including your `.json` configs, `AGENTS.md` file, scripts that setup the agents environment, like installing MCP servers etc, and a brief `README.md` that details three things:

1. **Purpose, target harness, and target model.** We've discussed at length how much harness architecture and bias can change and degrade the performance of an agent. More importantly, you should have a clear 1-2 sentence description of what the agent is for and what it does.

2. **Prohibitions.** This is more important than it sounds, but you should have a list of what the agent is expressly not allowed to do including prohibited commands, tools, and inapplicable use cases. This is an exercise in defining the bounds of scope as much as it is a description on intended behavior, but it's also an opportunity to perform a security check. For example, an MCP servers can potentially expand what the agent thinks it's allowed to do as Jonathan Vila points out in his blog post ["5 Best Practices for Working with AI Agents, Subagents, Skills and MCP"](https://foojay.io/today/best-practices-for-working-with-ai-agents-subagents-skills-and-mcp/).

3. **Permissions and configuration.** Don't just repeat what's in `opencode.json`, for example. Define which LSP/MCP servers are included. List out each tool the agent is allowed to use and justify its purpose in an adjacent phrase. Conclude with how context is engineered and intended to be managed.

Review your `README.md` and make sure it complies with industry best practice: 
- Do you have less than 8 tools? 
- Are the tools distinct in purpose and description? 
- Are alternatives properly prohibited at the context-level (in `AGENTS.md`), the harness-level, and the process-level?
- How will the context change during the lifecycle of a prompt and what has the power to modify it?
- Could other more boring tools be used instead of an agentic approach (e.g. `prettier` for code formatting)?

That last question is perhaps the most important. This paper started with the claim, "*A good engineer knows when to use AI and when to use other tools.*" You don't need AI for tasks like code formating, structural indexing, running tests or building binaries, type checking and linting, etc. For each one of these, there are open-source, deterministic, and much more reliable tools than the use of a reasoning model that has the capacity to hallucinate output. Indeed, OpenCode has a ["formatters"](https://opencode.ai/docs/formatters/) that can automatically run code formatting tools like `prettier` after a code generation task without involving the LLM. AI is *powerful*. Use boring, efficient tools where applicable, and leverage AI where it excels.

Cheers!

---

## Getting Started

> [!WARNING]
> This project is deprecated and unfinished. The following is intended getting started behavior but may not work or be fully implemented.

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

## Usage

> [!WARNING]
> This project is deprecated and unfinished. The following is intended usage behavior but may not work or be fully implemented.

#### 1. Running as an MCP Server (Stdio)

Start the stdio MCP server directly using Bun:

```bash
OPENAI_API_KEY="sk-..." bun run src/index.ts
```

#### 2. Configuring in OpenCode / Claude Desktop / Cursor

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

#### 3. VS Code Copilot Agent Integration

For VS Code users, the included `vscode-extension/` folder provides an extension wrapper:
1. Open `vscode-extension/` in VS Code or install the compiled extension package.
2. The extension automatically registers `fishstick` in VS Code's native MCP server catalog and exposes the `fishstick_search_code` tool to GitHub Copilot chat participants and agents.

### Available MCP Tools

The server exposes five core MCP tools:

| MCP Tool Name | Description |
|---|---|
| `code_index_search` | Perform semantic vector search over the indexed codebase. Accepts `query`, optional `directoryPrefix`, and `workspacePath`. |
| `code_index_start` | Trigger background directory scan and file watcher (`chokidar`) for a workspace folder. |
| `code_index_status` | Retrieve current indexing state (`Standby`, `Indexing`, `Indexed`, `Error`), block counts, and file watcher progress. |
| `code_index_clear` | Clear vector database tables and local cache files for a workspace. |
| `code_index_configure` | Dynamically update embedding provider, model ID, search minScore, maxResults, or vector store at runtime. |

### Configuration Hierarchy

Configuration is resolved automatically in the following order of precedence (highest to lowest):
- Priority 1: Dynamic MCP Tool Calls (`code_index_config`)
- Priority 2: Workspace Config (`.fishstick.json`) 
- Priority 3: Global User Config (`~/.config/fishstick/fishstick.json`)
- Priority 4: Environment Variables (`.env`) / Defaults

#### Example `.fishstick.json` or `~/.config/fishstick/fishstick.json`

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

#### Environment Variables (`.env`)

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API Key for default embedder | — |
| `VECTOR_STORE_PROVIDER` | `sqlite` (zero-docker local) or `qdrant` | `sqlite` |
| `QDRANT_URL` | Qdrant database server URL | `http://localhost:6333` |
| `EMBEDDER_PROVIDER` | Embedder provider (`openai`, `ollama`, `gemini`, etc.) | `openai` |
| `EMBEDDER_MODEL_ID` | Model identifier | `text-embedding-3-small` |
| `SEARCH_MIN_SCORE` | Similarity score cutoff (0.0 to 1.0) | `0.3` |
| `SEARCH_MAX_RESULTS` | Max results returned by search | `20` |

### Ignore Rules (`.fishignore` + `.gitignore`)

`ministic-fishstick` uses `FishIgnoreController` to filter files before parsing and indexing:
- **`.gitignore`**: Automatically respected if present in the workspace.
- **`.fishignore`**: Custom ignore file for indexing rules (uses standard `.gitignore` glob syntax).
- **Auto-ignored:** `.git`, `.fishignore`, `.fishstick.json`, `node_modules/`, binary files, and vector database caches are always excluded.

## License

Apache 2.0 © 2026 Israel Flores-Arbolay.

## Credits

[The Zoo Code Team](https://github.com/Zoo-Code-Org/Zoo-Code)