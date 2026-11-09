import { AsyncLocalStorage } from 'node:async_hooks'

import { isLocale, type Locale, overwriteGetLocale } from '~/i18n/paraglide/runtime'
import { DEFAULT_LOCALE } from '~/shared/utils/language'

// The one getLocale override in the process, web server and worker alike: the runtime keeps a
// single one, so a second would replace the first, whichever module happened to load last.
const localeStore = new AsyncLocalStorage<Locale>()

overwriteGetLocale(() => {
  return localeStore.getStore() ?? DEFAULT_LOCALE
})

/** Runs `fn` with `getLocale()`, and so every `m.*()` call without an explicit locale, in `locale`. */
export function runWithLocale<T>(locale: Locale, fn: () => T): T {
  return localeStore.run(locale, fn)
}

/**
 * The language to address an account in, whoever acts: the one it chose for itself, else its
 * congregation's, else the default locale. Both columns are free text, so each is checked.
 */
export function accountLocale(account: { locale: string | null }, congregationLocale: string): Locale {
  if (isLocale(account.locale)) return account.locale
  return isLocale(congregationLocale) ? congregationLocale : DEFAULT_LOCALE
}
