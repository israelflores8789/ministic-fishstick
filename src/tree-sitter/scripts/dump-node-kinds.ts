import { writeFileSync, readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { Parser, Language, Query } from 'web-tree-sitter'

async function main() {
  const [, , wasmPath, sourcePath] = process.argv

  if (!wasmPath || !sourcePath) {
    console.error('Usage: bun run dump-node-kinds.ts <path-to-wasm> <path-to-sample-source-file>')
    console.error('Example: bun run dump-node-kinds.ts ./tree-sitter-haskell.wasm ./sample.hs')
    process.exit(1)
  }

  await Parser.init()
  const lang = await Language.load(wasmPath)
  const parser = new Parser()
  parser.setLanguage(lang)

  const source = readFileSync(sourcePath, 'utf8')
  const tree = parser.parse(source)

  const seen = new Map<string, string>()
  const cursor = tree!.walk()

  // Haskell query debugging
  // const patterns = [
  //   `(data_type name: (_) @name)`,
  //   `(newtype name: (_) @name)`,
  //   `(class name: (_) @name)`,
  //   `(instance name: (_) @name)`,
  //   `(type_synomym name: (_) @name)`,
  // ]

  // Use the following code to test specific queries against the parsed tree
  // for (const p of patterns) {
  //   const q = new Query(lang, p)
  //   const caps = q.captures(tree!.rootNode)
  //   console.log(
  //     p,
  //     '->',
  //     caps.map((c) => c.node.text)
  //   )
  // }

  let reachedRoot = false
  while (!reachedRoot) {
    if (cursor.nodeIsNamed) {
      const type = cursor.nodeType
      if (!seen.has(type)) {
        seen.set(type, cursor.nodeText.replace(/\n/g, '\\n').slice(0, 50))
      }
    }

    if (cursor.gotoFirstChild()) continue
    if (cursor.gotoNextSibling()) continue

    let retracing = true
    while (retracing) {
      if (!cursor.gotoParent()) {
        retracing = false
        reachedRoot = true
      } else if (cursor.gotoNextSibling()) {
        retracing = false
      }
    }
  }

  const rows = [...seen.entries()].sort(([a], [b]) => a.localeCompare(b))
  const csv =
    'type,example\n' + rows.map(([t, e]) => `"${t}","${e.replace(/"/g, '""')}"`).join('\n')

  const langLabel = basename(wasmPath, extname(wasmPath)).replace(/^tree-sitter-/, '')
  const outFile = `node-kinds-${langLabel}.csv`
  writeFileSync(outFile, csv)
  console.log(`wrote ${rows.length} distinct node types to ${outFile}`)
}

main()
