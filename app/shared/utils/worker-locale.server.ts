import { AsyncLocalStorage } from 'node:async_hooks'
import { baseLocale, isLocale, type Locale, overwriteGetLocale } from '~/i18n/paraglide/runtime'

interface WorkerContext {
  locale: Locale
  timezone: string | undefined
}

const workerContextStore = new AsyncLocalStorage<WorkerContext>()

overwriteGetLocale(() => {
  return workerContextStore.getStore()?.locale ?? baseLocale
})

/**
 * Extended context: threads a **locale** AND a **timezone** through the
 * async callback so server-side date rendering can respect the
 * congregation's TZ (`Intl.DateTimeFormat(..., { timeZone })`) rather
 * than the process TZ.
 */
export function runInWorkerContext<T>(locale: string, timezone: string, fn: () => T | Promise<T>): T | Promise<T> {
  const resolvedLocale = isLocale(locale) ? locale : baseLocale
  return workerContextStore.run({ locale: resolvedLocale, timezone }, fn)
}

/**
 * Backward-compatible: locale-only wrapper. Callers that don't know a
 * congregation timezone leave `getWorkerTimezone()` as `undefined`,
 * which makes `Intl.DateTimeFormat` fall back to the process TZ.
 * Prefer `runInWorkerContext` when a congregation timezone is available.
 */
export function runWithLocale<T>(locale: string, fn: () => T | Promise<T>): T | Promise<T> {
  const resolvedLocale = isLocale(locale) ? locale : baseLocale
  return workerContextStore.run({ locale: resolvedLocale, timezone: undefined }, fn)
}

/** Returns the timezone set by the enclosing `runInWorkerContext`, or `undefined`. */
export function getWorkerTimezone(): string | undefined {
  return workerContextStore.getStore()?.timezone
}
