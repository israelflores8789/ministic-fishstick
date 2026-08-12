/**
 * Simple i18n helper function replacing VS Code extension i18n
 */
export function t(key: string, params?: Record<string, any>): string {
  let message = key
  // Simple parameter substitution e.g. {errorMessage}
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      message = message.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return message
}
