import { describe, test, expect } from 'bun:test'
import { loadRequiredLanguageParsers } from '../src/tree-sitter/languageParser'

describe('Tree-sitter Language Parser', () => {
  test('loads TypeScript parser and parses simple code', async () => {
    const parsers = await loadRequiredLanguageParsers(['example.ts'])
    expect(parsers.ts).toBeDefined()

    const { parser, query } = parsers.ts
    const code = "function helloWorld(): string { return 'hello'; }"
    const tree = parser.parse(code)
    expect(tree).not.toBeNull()
    if (tree) {
      expect(tree.rootNode.type).toBe('program')
      const captures = query.captures(tree.rootNode)
      expect(captures.length).toBeGreaterThan(0)
    }
  })
})
