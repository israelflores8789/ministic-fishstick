import { logger } from '../logger'

const log = logger('Telemetry')

/**
 * Standalone no-op telemetry service for ministic-fishstick
 */
export class TelemetryService {
  private static _instance: TelemetryService = new TelemetryService()

  public static get instance(): TelemetryService {
    return TelemetryService._instance
  }

  public captureEvent(eventName: string, properties?: Record<string, any>): void {
    // Log errors to console if debug mode is enabled
    if (process.env.DEBUG) {
      log.warn(`${eventName}`, properties)
    }
  }
}

export enum TelemetryEventName {
  CODE_INDEX_ERROR = 'code_index_error',
}
