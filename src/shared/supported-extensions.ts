import { extensions as allExtensions } from '../tree-sitter'
import { fallbackExtensions, isFallbackExtension } from './fallback-extensions'

export { fallbackExtensions }

export const scannerExtensions = allExtensions

export function shouldUseFallbackChunking(extension: string): boolean {
  return isFallbackExtension(extension)
}
