# Extending Tree-Sitter with More Languages
**_An example with Lean_**

**Requirements:**
- `web-tree-sitter`

1. Build the `.wasm` binary to parse the language. For this example, we'll use [`wvhulle`'s](https://github.com/wvhulle/tree-sitter-lean) grammar parser in C/Rust:
```bash
bun add -g tree-sitter-cli
git clone https://github.com/wvhulle/tree-sitter-lean.git
cd tree-sitter-lean

# make sure parser.c is up to date
bunx tree-sitter generate

# build the wasm
bunx tree-sitter build --wasm
```

2. Move the `wasm` to `src/tree-sitter/wasm/`

3. `wvhulle` actually has a good set of queries; however, it's still good to compare with what tree-sitter is actually parsing. Run the dump script, `dump-node-kinds-lean.ts` in `src/tree-sitter/scripts`:
```bash
cd /ministic-fishstick/src/tree-sitter/scripts/
bun dump-node-kinds-lean.ts ../wasm/tree-sitter-lean.wasm ./sample.lean
```

This will generate a csv file you can use as a truth source for what tree-sitter is actaully parsing with the given `wasm`.

4. Develop the `scm`-style query and add it to `queries/`

5. Refactor `languageParser.ts` and `index.ts` in the `tree-sitter` module to include the new language and query. Also make sure you refactor `index.ts` in the `tree-sitter/queries/` to export `lean.ts` as a `leanQuery`.