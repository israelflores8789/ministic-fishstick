import i18next from 'i18next'
import { translations } from './locales.generated'
import { getAppLogger } from '../logger'

const logger = getAppLogger(['i18n'])

/**
 * Translations are statically imported via locales.generated.ts,
 * which is produced at build time by scripts/generate-locales.ts.
 *
 * This avoids runtime fs.readdirSync directory scanning, which
 * cannot survive `bun build --compile` (no directory-embedding
 * support, and __dirname is unreliable in compiled/bundled output).
 * Bun's bundler inlines these JSON imports directly into the
 * compiled binary at build time — no external locale files are
 * needed at runtime.
 */

const isTestEnv = process.env.NODE_ENV === 'test'

i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  debug: false,
  resources: isTestEnv ? {} : translations,
  interpolation: {
    escapeValue: false,
  },
})

if (!isTestEnv) {
  logger.info`Loaded translations for languages: ${Object.keys(translations).join(', ')}`
}

export default i18next
