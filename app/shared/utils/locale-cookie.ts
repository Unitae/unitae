import { isLocale, type Locale } from '~/i18n/paraglide/runtime'

// The cookie Paraglide's client runtime reads: the `cookie` strategy comes first in its settings.
const LOCALE_COOKIE = /(?:^|;\s*)PARAGLIDE_LOCALE=([^;]+)/

/** The locale the visitor's browser translates with, or null when it holds none the app ships. */
export function localeFromCookie(request: Request): Locale | null {
  const value = LOCALE_COOKIE.exec(request.headers.get('Cookie') ?? '')?.[1]
  return isLocale(value) ? value : null
}

/** The `Set-Cookie` value that makes the browser translate with `locale`. */
export function localeCookie(locale: Locale): string {
  return `PARAGLIDE_LOCALE=${locale}; Path=/; Max-Age=34560000; SameSite=Lax`
}
