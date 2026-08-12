const PROJECT = 'ministic-fishstick'

export function logger(scope: string) {
  const prefix = scope === '' ? `[${PROJECT}]` : `[${PROJECT}:${scope}]`
  return {
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  }
}
