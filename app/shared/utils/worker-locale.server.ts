import { AsyncLocalStorage } from 'node:async_hooks'
import { baseLocale, isLocale, type Locale, overwriteGetLocale } from '~/i18n/paraglide/runtime'

const workerLocaleStore = new AsyncLocalStorage<Locale>()

overwriteGetLocale(() => {
  return workerLocaleStore.getStore() ?? baseLocale
})

export function runWithLocale<T>(locale: string, fn: () => T | Promise<T>): T | Promise<T> {
  const resolved = isLocale(locale) ? locale : baseLocale
  return workerLocaleStore.run(resolved, fn)
}
