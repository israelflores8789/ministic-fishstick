import i18next from './setup'
import { availableLanguages } from './locales.generated'

/**
 * Detects a usable language from, in priority order:
 *   1. an explicit override (e.g. a --lang CLI flag or config value)
 *   2. the OS locale
 *   3. fallback to "en"
 *
 * Only returns a language that actually has bundled translations —
 * falls back to "en" if the detected/requested language isn't available.
 */
export function detectLanguage(explicitOverride?: string): string {
  const candidates = [
    explicitOverride,
    Intl.DateTimeFormat().resolvedOptions().locale?.split('-')[0],
    'en',
  ].filter((v): v is string => Boolean(v))

  for (const candidate of candidates) {
    if (availableLanguages.includes(candidate)) return candidate
  }

  return 'en'
}

/**
 * Initialize i18next with the specified language.
 * @param language The language code to use
 */
export function initializeI18n(language: string): void {
  i18next.changeLanguage(language)
}

/**
 * Get the current language
 * @returns The current language code
 */
export function getCurrentLanguage(): string {
  return i18next.language
}

/**
 * Change the current language
 * @param language The language code to change to
 */
export function changeLanguage(language: string): void {
  i18next.changeLanguage(language)
}

/**
 * Translate a string using i18next
 * @param key The translation key, can use namespace with colon, e.g. "errors:missingApiKey"
 * @param options Options for interpolation or pluralization
 * @returns The translated string
 */
export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(key, options)
}

export { availableLanguages }
export default i18next
