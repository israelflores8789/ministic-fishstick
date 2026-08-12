import * as fs from "fs/promises"
import * as path from "path"
import { LanguageParser, loadRequiredLanguageParsers } from "./languageParser"
import { parseMarkdown } from "./markdownParser"
import { FishIgnoreController } from "../ignore/fish-ignore"
import { QueryCapture } from "web-tree-sitter"
import { isNonStructuralExtension } from "../shared/fallback-extensions"

const DEFAULT_MIN_COMPONENT_LINES_VALUE = 4
let currentMinComponentLines = DEFAULT_MIN_COMPONENT_LINES_VALUE

export function getMinComponentLines(): number {
	return currentMinComponentLines
}

export function setMinComponentLines(value: number): void {
	currentMinComponentLines = value
}

const extensions = [
	"tla", "js", "jsx", "ts", "vue", "tsx", "py", "rs", "go",
	"c", "h", "cpp", "hpp", "cs", "rb", "java", "php", "swift",
	"sol", "kt", "kts", "ex", "exs", "el", "html", "htm", "md",
	"markdown", "txt", "json", "css", "rdl", "ml", "mli", "lua",
	"scala", "toml", "zig", "elm", "ejs", "erb", "vb", "dart",
].map((e) => `.${e}`)

export { extensions }

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.stat(filePath)
		return true
	} catch {
		return false
	}
}

export async function parseSourceCodeDefinitionsForFile(
	filePath: string,
	fishIgnoreController?: FishIgnoreController,
): Promise<string | undefined> {
	if (!(await fileExists(path.resolve(filePath)))) {
		return "This file does not exist or you do not have permission to access it."
	}

	const ext = path.extname(filePath).toLowerCase()
	if (!extensions.includes(ext)) {
		return undefined
	}

	if (isNonStructuralExtension(ext)) {
		return undefined
	}

	if (ext === ".md" || ext === ".markdown") {
		if (fishIgnoreController && !fishIgnoreController.validateAccess(filePath)) {
			return undefined
		}

		const fileContent = await fs.readFile(filePath, "utf8")
		const lines = fileContent.split("\n")
		const markdownCaptures = parseMarkdown(fileContent)
		const markdownDefinitions = processCaptures(markdownCaptures, lines, "markdown")

		if (markdownDefinitions) {
			return `# ${path.basename(filePath)}\n${markdownDefinitions}`
		}
		return undefined
	}

	const languageParsers = await loadRequiredLanguageParsers([filePath])
	const definitions = await parseFile(filePath, languageParsers, fishIgnoreController)
	if (definitions) {
		return `# ${path.basename(filePath)}\n${definitions}`
	}

	return undefined
}

function processCaptures(captures: QueryCapture[], lines: string[], language: string): string | null {
	const needsHtmlFiltering = ["jsx", "tsx"].includes(language)

	const isNotHtmlElement = (line: string): boolean => {
		if (!needsHtmlFiltering) return true
		const HTML_ELEMENTS = /^[^A-Z]*<\/?(?:div|span|button|input|h[1-6]|p|a|img|ul|li|form)\b/
		const trimmedLine = line.trim()
		return !HTML_ELEMENTS.test(trimmedLine)
	}

	if (captures.length === 0) {
		return null
	}

	let formattedOutput = ""
	captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row)

	const processedLines = new Set<string>()

	captures.forEach((capture) => {
		const { node, name } = capture

		if (!name.includes("definition") && !name.includes("name")) {
			return
		}

		const definitionNode = name.includes("name") ? node.parent : node
		if (!definitionNode) return

		const trailingDefinitionBody =
			definitionNode.nextSibling?.type === "function_body" ? definitionNode.nextSibling : undefined

		const startLine = definitionNode.startPosition.row
		const endLine = trailingDefinitionBody?.endPosition.row ?? definitionNode.endPosition.row
		const lineCount = endLine - startLine + 1

		if (lineCount < getMinComponentLines()) {
			return
		}

		const lineKey = `${startLine}-${endLine}`
		if (processedLines.has(lineKey)) {
			return
		}

		const startLineContent = lines[startLine]?.trim() || ""

		if (name.includes("name.definition")) {
			const componentName = node.text
			if (!processedLines.has(lineKey) && componentName) {
				formattedOutput += `${startLine + 1}--${endLine + 1} | ${lines[startLine]}\n`
				processedLines.add(lineKey)
			}
		} else if (isNotHtmlElement(startLineContent)) {
			formattedOutput += `${startLine + 1}--${endLine + 1} | ${lines[startLine]}\n`
			processedLines.add(lineKey)

			if (node.parent && node.parent.lastChild) {
				const contextEnd = node.parent.lastChild.endPosition.row
				const contextSpan = contextEnd - node.parent.startPosition.row + 1
				const hasDistinctContextStart = node.parent.startPosition.row !== startLine

				if (hasDistinctContextStart && contextSpan >= getMinComponentLines()) {
					const rangeKey = `${node.parent.startPosition.row}-${contextEnd}`
					if (!processedLines.has(rangeKey)) {
						formattedOutput += `${node.parent.startPosition.row + 1}--${contextEnd + 1} | ${lines[node.parent.startPosition.row]}\n`
						processedLines.add(rangeKey)
					}
				}
			}
		}
	})

	return formattedOutput.length > 0 ? formattedOutput : null
}

async function parseFile(
	filePath: string,
	languageParsers: LanguageParser,
	fishIgnoreController?: FishIgnoreController,
): Promise<string | null> {
	if (fishIgnoreController && !fishIgnoreController.validateAccess(filePath)) {
		return null
	}

	const fileContent = await fs.readFile(filePath, "utf8")
	const extLang = path.extname(filePath).toLowerCase().slice(1)

	const { parser, query } = languageParsers[extLang] || {}
	if (!parser || !query) {
		return `Unsupported file type: ${filePath}`
	}

	try {
		const tree = parser.parse(fileContent)
		const captures = tree ? query.captures(tree.rootNode) : []
		const lines = fileContent.split("\n")
		return processCaptures(captures, lines, extLang)
	} catch (error) {
		console.log(`Error parsing file: ${error}\n`)
		return null
	}
}
