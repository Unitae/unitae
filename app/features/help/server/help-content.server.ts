import { HELP_LOCALES, type HelpArticle, type HelpLocale } from '~/features/help/model/help.type'
import { HelpArticleFormatError, parseHelpArticle } from '~/features/help/model/parse-help-article'
import { logger } from '~/shared/infra/logger.server'

// The article files ship inside the app bundle (read at build time), so self-hosted instances carry the help of their own version.
const SOURCES = import.meta.glob<string>('../content/*/*.md', { query: '?raw', import: 'default', eager: true })

const MARKDOWN_EXTENSION = /\.md$/

/**
 * Turns a set of article files, keyed by their path `…/<locale>/<slug>.md`, into the articles, and checks what must
 * hold across them: a file is named after its slug and lives in a known language folder; each slug exists in both
 * languages with the same permission, module, order and related set; every related slug exists and is not the article
 * itself. Any breach is a {@link HelpArticleFormatError}.
 */
export function assembleHelpArticles(sources: Record<string, string>): HelpArticle[] {
  const articles: HelpArticle[] = []
  const seen = new Set<string>()

  for (const [path, source] of Object.entries(sources)) {
    const folder = path.split('/').at(-2) ?? ''
    if (!(HELP_LOCALES as readonly string[]).includes(folder)) {
      throw new HelpArticleFormatError(`Help article « ${path} » is not in a known language folder.`)
    }
    const article = parseHelpArticle(source, folder as HelpLocale)

    const fileSlug = (path.split('/').at(-1) ?? '').replace(MARKDOWN_EXTENSION, '')
    if (fileSlug !== article.slug) {
      throw new HelpArticleFormatError(
        `Help article « ${path} » has a file name that is not its slug « ${article.slug} ».`,
      )
    }

    const key = `${article.locale}/${article.slug}`
    if (seen.has(key)) throw new HelpArticleFormatError(`Two help articles share the slug « ${key} ».`)
    seen.add(key)
    articles.push(article)
  }

  for (const article of articles) {
    checkRelated(article, articles)
    for (const locale of HELP_LOCALES) {
      if (locale !== article.locale) checkCounterpart(article, articleInLocale(articles, locale, article.slug))
    }
  }

  return articles.sort((a, b) => a.locale.localeCompare(b.locale) || a.order - b.order || a.slug.localeCompare(b.slug))
}

function articleInLocale(articles: readonly HelpArticle[], locale: HelpLocale, slug: string): HelpArticle | undefined {
  return articles.find(candidate => candidate.locale === locale && candidate.slug === slug)
}

function checkRelated(article: HelpArticle, articles: readonly HelpArticle[]): void {
  for (const related of article.related) {
    if (related === article.slug) {
      throw new HelpArticleFormatError(`Help article « ${article.slug} » lists itself as related.`)
    }
    if (articleInLocale(articles, article.locale, related) == null) {
      throw new HelpArticleFormatError(
        `Help article « ${article.slug} » relates to « ${related} », which does not exist.`,
      )
    }
  }
}

function checkCounterpart(article: HelpArticle, counterpart: HelpArticle | undefined): void {
  if (counterpart == null) {
    throw new HelpArticleFormatError(
      `Help article « ${article.slug} » is missing in one language: both languages must carry it.`,
    )
  }
  if (permissionKey(counterpart) !== permissionKey(article)) {
    throw new HelpArticleFormatError(
      `Help article « ${article.slug} » has a permission that differs between the languages.`,
    )
  }
  if (counterpart.module !== article.module) {
    throw new HelpArticleFormatError(
      `Help article « ${article.slug} » has a module that differs between the languages.`,
    )
  }
  if (counterpart.order !== article.order) {
    throw new HelpArticleFormatError(
      `Help article « ${article.slug} » has an order that differs between the languages.`,
    )
  }
  if (sortedRelated(counterpart).join('|') !== sortedRelated(article).join('|')) {
    throw new HelpArticleFormatError(
      `Help article « ${article.slug} » has a related set that differs between the languages.`,
    )
  }
}

function sortedRelated(article: HelpArticle): string[] {
  return [...article.related].sort()
}

type Loaded = { articles: HelpArticle[] } | { error: HelpArticleFormatError }

// Parsed and checked once, when the server starts. A malformed article is logged here and kept as an error: the layout
// gives its pages no help, rather than every signed-in page failing on each request. The tests load the shipped set and
// fail the build on the same error.
const LOADED: Loaded = loadAtStartup()

function loadAtStartup(): Loaded {
  try {
    return { articles: assembleHelpArticles(SOURCES) }
  } catch (error) {
    if (error instanceof HelpArticleFormatError) {
      logger.error(`In-app help is unavailable: ${error.message}`)
      return { error }
    }
    throw error
  }
}

/** The shipped articles, in language, order and slug. Throws the format error when they did not load. */
export function loadHelpArticles(): HelpArticle[] {
  if ('error' in LOADED) throw LOADED.error
  return LOADED.articles
}

/** The permissions of an article as one comparable value: the same set in any order compares equal. */
function permissionKey(article: HelpArticle): string {
  return article.permission == null ? 'none' : [...article.permission].sort().join('|')
}
