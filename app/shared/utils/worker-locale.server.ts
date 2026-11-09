import { AsyncLocalStorage } from 'node:async_hooks'
import { isLocale } from '~/i18n/paraglide/runtime'
import { DEFAULT_LOCALE } from '~/shared/utils/language'
import { runWithLocale } from '~/shared/utils/locale-scope.server'

interface WorkerContext {
  timezone: string | undefined
}

const workerContextStore = new AsyncLocalStorage<WorkerContext>()

/**
 * Threads a **locale** AND a **timezone** through the async callback so
 * server-side date rendering can respect the congregation's TZ
 * (`Intl.DateTimeFormat(..., { timeZone })`) rather than the process TZ.
 * The locale goes through runWithLocale, the app's one getLocale override.
 */
export function runInWorkerContext<T>(locale: string, timezone: string, fn: () => T | Promise<T>): T | Promise<T> {
  const resolvedLocale = isLocale(locale) ? locale : DEFAULT_LOCALE
  return runWithLocale(resolvedLocale, () => workerContextStore.run({ timezone }, fn))
}

/** Returns the timezone set by the enclosing `runInWorkerContext`, or `undefined`. */
export function getWorkerTimezone(): string | undefined {
  return workerContextStore.getStore()?.timezone
}
