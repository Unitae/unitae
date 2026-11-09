import { getLocale, type Locale } from '~/i18n/paraglide/runtime'

/**
 * The language used when neither the account nor its congregation chose one, and the language a
 * new congregation starts in. Paraglide's base locale is English instead: it is only the fallback
 * for a message a translation does not have yet.
 */
export const DEFAULT_LOCALE: Locale = 'fr'

function capitalise(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

function nameOf(language: string, inLanguage: string): string {
  const name = new Intl.DisplayNames([inLanguage], { type: 'language' }).of(language) ?? language
  return capitalise(name, inLanguage)
}

/**
 * How a language picker names `locale`: in that language, so its speakers find it, then in the
 * viewer's language, so everyone else can tell what it is — « Українська (Ukrainien) ».
 */
export function languageLabel(locale: string, viewerLocale: string = getLocale()): string {
  const own = nameOf(locale, locale)
  return locale === viewerLocale ? own : `${own} (${nameOf(locale, viewerLocale)})`
}
