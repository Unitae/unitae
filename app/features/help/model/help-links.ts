import {
  HELP_FALLBACK_LOCALE,
  HELP_LOCALES,
  HELP_SOURCE_LOCALES,
  type HelpArticle,
  type HelpLocale,
} from '~/features/help/model/help.type'

/** The address parameter that opens an article in the side panel: `?help=absences`. */
export const HELP_PANEL_PARAM = 'help'

/** The fallback for every reader, managed or self-hosted: the repository is public, so no congregation data goes there. */
export const HELP_ISSUES_URL = 'https://github.com/Unitae/unitae/issues'

export function helpPagePath(slug?: string): string {
  return slug ? `/help/${encodeURIComponent(slug)}` : '/help'
}

/** The language the articles are read in: the app's own when it has a folder of articles, English otherwise. */
export function helpLocaleFor(locale: string): HelpLocale {
  return (HELP_LOCALES as readonly string[]).includes(locale) ? (locale as HelpLocale) : HELP_FALLBACK_LOCALE
}

/**
 * The articles of a language, and the English one for each article it lacks: article by article, like the messages.
 * French and English carry every article, so only a translation can lack one.
 */
export function helpArticlesIn(articles: readonly HelpArticle[], locale: HelpLocale): HelpArticle[] {
  const own = articles.filter(article => article.locale === locale)
  if (HELP_SOURCE_LOCALES.includes(locale)) return own
  const translated = new Set(own.map(({ slug }) => slug))
  return [
    ...own,
    ...articles.filter(article => article.locale === HELP_FALLBACK_LOCALE && !translated.has(article.slug)),
  ]
}
