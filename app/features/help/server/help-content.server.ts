import { HELP_LOCALES, type HelpArticle, type HelpLocale } from '~/features/help/model/help.type'
import { visibleHelpSlugs } from '~/features/help/model/help-access'
import { parseHelpArticle } from '~/features/help/model/parse-help-article'
import type { Permission } from '~/shared/types/permission'

// The article files ship inside the app bundle (read at build time), so self-hosted instances carry the help of their own version.
const SOURCES = import.meta.glob<string>('../content/*/*.md', { query: '?raw', import: 'default', eager: true })

/**
 * Turns a set of article files, keyed by their path `…/<locale>/<slug>.md`, into the articles. Refuses a file of an
 * unknown language, and two files with the same slug in one language.
 */
export function assembleHelpArticles(sources: Record<string, string>): HelpArticle[] {
  const seen = new Set<string>()

  return Object.entries(sources)
    .map(([path, source]) => {
      const locale = path.split('/').at(-2) ?? ''
      if (!(HELP_LOCALES as readonly string[]).includes(locale)) {
        throw new Error(`Help article « ${path} » is not in a known language folder.`)
      }
      const article = parseHelpArticle(source, locale as HelpLocale)
      const key = `${article.locale}/${article.slug}`
      if (seen.has(key)) throw new Error(`Two help articles share the slug « ${key} ».`)
      seen.add(key)
      return article
    })
    .sort((a, b) => a.locale.localeCompare(b.locale) || a.order - b.order || a.slug.localeCompare(b.slug))
}

let cached: HelpArticle[] | null = null

export function loadHelpArticles(): HelpArticle[] {
  cached ??= assembleHelpArticles(SOURCES)
  return cached
}

/** The slugs this reader may open, for the « ? » entry points of the pages. */
export function visibleHelpSlugsFor(permissions: ReadonlySet<Permission>): string[] {
  return visibleHelpSlugs(loadHelpArticles(), permissions)
}
