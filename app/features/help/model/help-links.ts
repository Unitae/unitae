import { HELP_FALLBACK_LOCALE, HELP_LOCALES, type HelpLocale } from '~/features/help/model/help.type'

/** The address parameter that opens an article in the side panel: `?aide=absences`. */
export const HELP_PANEL_PARAM = 'aide'

/** The fallback for every reader, managed or self-hosted: the repository is public, so no congregation data goes there. */
export const HELP_ISSUES_URL = 'https://github.com/Unitae/unitae/issues'

export function helpPagePath(slug?: string): string {
  return slug ? `/aide/${encodeURIComponent(slug)}` : '/aide'
}

/** The language the articles are read in: English when the app is in English, French otherwise. */
export function helpLocaleFor(locale: string): HelpLocale {
  return (HELP_LOCALES as readonly string[]).includes(locale) ? (locale as HelpLocale) : HELP_FALLBACK_LOCALE
}
