/**
 * Build-time script: scans src/i18n/locales/<lang>/<namespace>.json
 * and generates src/i18n/locales.generated.ts containing static
 * ES imports for every discovered file.
 *
 * Bun's bundler inlines JSON imports as parsed JS objects when
 * compiling with `bun build --compile`, so no `with { type: "file" }`
 * asset-embedding trick is needed — plain imports are sufficient
 * and get baked directly into the compiled binary.
 *
 * Run manually with: bun run scripts/generate-locales.ts
 * Wire into package.json as a "prebuild" step so it always
 * runs before `bun build --compile`.
 */

import fs from 'node:fs'
import path from 'node:path'

const LOCALES_DIR = path.join(import.meta.dir, '..', 'src', 'i18n', 'locales')
const OUTPUT_FILE = path.join(import.meta.dir, '..', 'src', 'i18n', 'locales.generated.ts')

interface LocaleEntry {
  language: string
  namespace: string
  importPath: string
  varName: string
}

function toVarName(language: string, namespace: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_')
  return `${safe(language)}_${safe(namespace)}`
}

function discoverLocales(): LocaleEntry[] {
  if (!fs.existsSync(LOCALES_DIR)) {
    throw new Error(`Locales directory not found: ${LOCALES_DIR}`)
  }

  const languageDirs = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort()

  const entries: LocaleEntry[] = []

  for (const language of languageDirs) {
    const langPath = path.join(LOCALES_DIR, language)
    const files = fs
      .readdirSync(langPath, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.json') && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort()

    for (const file of files) {
      const namespace = path.basename(file, '.json')
      entries.push({
        language,
        namespace,
        importPath: `./locales/${language}/${file}`,
        varName: toVarName(language, namespace),
      })
    }
  }

  return entries
}

function generateSource(entries: LocaleEntry[]): string {
  const importLines = entries.map((e) => `import ${e.varName} from "${e.importPath}"`).join('\n')

  const byLanguage = new Map<string, LocaleEntry[]>()
  for (const entry of entries) {
    if (!byLanguage.has(entry.language)) byLanguage.set(entry.language, [])
    byLanguage.get(entry.language)!.push(entry)
  }

  const languageBlocks = Array.from(byLanguage.entries())
    .map(([language, langEntries]) => {
      const namespaceLines = langEntries
        .map((e) => `    ${JSON.stringify(e.namespace)}: ${e.varName},`)
        .join('\n')
      return `  ${JSON.stringify(language)}: {\n${namespaceLines}\n  },`
    })
    .join('\n')

  return `// AUTO-GENERATED FILE — DO NOT EDIT MANUALLY.
// Regenerate with: bun run scripts/generate-locales.ts
// Source: src/i18n/locales/<lang>/<namespace>.json

${importLines}

export const translations: Record<string, Record<string, unknown>> = {
${languageBlocks}
}

export const availableLanguages: string[] = ${JSON.stringify(Array.from(byLanguage.keys()).sort())}
`
}

function main() {
  const entries = discoverLocales()

  if (entries.length === 0) {
    throw new Error(`No locale JSON files found under ${LOCALES_DIR}`)
  }

  const source = generateSource(entries)
  fs.writeFileSync(OUTPUT_FILE, source, 'utf8')

  const languages = Array.from(new Set(entries.map((e) => e.language))).sort()
  console.log(
    `Generated ${OUTPUT_FILE}\n` +
      `  Languages: ${languages.join(', ')}\n` +
      `  Total files: ${entries.length}`
  )
}

main()
