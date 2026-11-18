import {
  HELP_FALLBACK_LOCALE,
  HELP_LOCALES,
  HELP_SOURCE_LOCALES,
  type HelpArticle,
  type HelpLocale,
} from '~/features/help/model/help.type'
import { HELP_CAPTURE_SCHEME, type HelpCaptureManifest, helpImagesIn } from '~/features/help/model/help-captures'
import { HelpArticleFormatError, parseHelpArticle } from '~/features/help/model/parse-help-article'
import { HELP_CAPTURES } from '~/features/help/server/help-captures.server'
import { logger } from '~/shared/infra/logger.server'

// The article files ship inside the app bundle (read at build time), so self-hosted instances carry the help of their own version.
const SOURCES = import.meta.glob<string>('../content/*/*.md', { query: '?raw', import: 'default', eager: true })

const MARKDOWN_EXTENSION = /\.md$/
const NO_CAPTURES: HelpCaptureManifest = { fr: {}, en: {}, 'pt-PT': {} }

/**
 * Turns a set of article files, keyed by their path `…/<locale>/<slug>.md`, into the articles, and checks what must
 * hold across them: a file is named after its slug and lives in a known language folder; each slug exists in French
 * and English with the same permission, module, order, related set and captures; every related slug exists and is
 * not the article itself; every image is a described capture its language has. Any breach in French or English is a
 * {@link HelpArticleFormatError}.
 *
 * A translation may trail behind. A translated article that breaks one of these rules against French and English, or
 * that they do not have, is left out and handed to `onStale`: its readers get the English article, as for one never
 * translated, and the shipped-set test fails the build until it is brought up to date.
 */
export function assembleHelpArticles(
  sources: Record<string, string>,
  captures: HelpCaptureManifest = NO_CAPTURES,
  onStale: (error: HelpArticleFormatError) => void = () => {},
): HelpArticle[] {
  const articles = parseArticles(sources)

  const kept = articles.filter(article => HELP_SOURCE_LOCALES.includes(article.locale))
  for (const article of kept) checkArticle(article, articles, captures)

  for (const article of articles.filter(candidate => !HELP_SOURCE_LOCALES.includes(candidate.locale))) {
    try {
      checkArticle(article, articles, captures)
      kept.push(article)
    } catch (error) {
      if (!(error instanceof HelpArticleFormatError)) throw error
      onStale(error)
    }
  }

  return kept.sort((a, b) => a.locale.localeCompare(b.locale) || a.order - b.order || a.slug.localeCompare(b.slug))
}

/** Each file as an article: in a known language folder, named after its slug, its slug used once per language. */
function parseArticles(sources: Record<string, string>): HelpArticle[] {
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

  return articles
}

function articleInLocale(articles: readonly HelpArticle[], locale: HelpLocale, slug: string): HelpArticle | undefined {
  return articles.find(candidate => candidate.locale === locale && candidate.slug === slug)
}

/** Its related slugs and captures, then the same article in French and English, which every language follows. */
function checkArticle(article: HelpArticle, articles: readonly HelpArticle[], captures: HelpCaptureManifest): void {
  checkRelated(article, articles)
  checkCaptures(article, captures)
  for (const locale of HELP_SOURCE_LOCALES) {
    if (locale !== article.locale) checkCounterpart(article, articleInLocale(articles, locale, article.slug))
  }
}

function checkRelated(article: HelpArticle, articles: readonly HelpArticle[]): void {
  for (const related of article.related) {
    if (related === article.slug) {
      throw new HelpArticleFormatError(`Help article « ${article.slug} » lists itself as related.`)
    }
    const readable =
      articleInLocale(articles, article.locale, related) ?? articleInLocale(articles, HELP_FALLBACK_LOCALE, related)
    if (readable == null) {
      throw new HelpArticleFormatError(
        `Help article « ${article.slug} » relates to « ${related} », which does not exist.`,
      )
    }
  }
}

function checkCaptures(article: HelpArticle, captures: HelpCaptureManifest): void {
  for (const { alt, src } of helpImagesIn(article.body)) {
    if (!src.startsWith(HELP_CAPTURE_SCHEME)) {
      throw new HelpArticleFormatError(
        `Help article « ${article.locale}/${article.slug} » shows « ${src} »: an image must be a ${HELP_CAPTURE_SCHEME}<id>.`,
      )
    }
    if (alt.trim() === '') {
      throw new HelpArticleFormatError(
        `Help article « ${article.locale}/${article.slug} » has a capture without alt text.`,
      )
    }
    const id = src.slice(HELP_CAPTURE_SCHEME.length)
    if (captures[article.locale][id] == null) {
      throw new HelpArticleFormatError(
        `Help article « ${article.locale}/${article.slug} » shows the capture « ${id} », which that language does not have.`,
      )
    }
  }
}

/** The ids of an article's captures as one comparable value: the same set in any order compares equal. */
function captureKey(article: HelpArticle): string {
  return [...new Set(helpImagesIn(article.body).map(({ src }) => src))].sort().join('|')
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
  if (captureKey(counterpart) !== captureKey(article)) {
    throw new HelpArticleFormatError(
      `Help article « ${article.slug} » shows captures that differ between the languages.`,
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

// Its readers get the English article meanwhile; the shipped-set test fails the build on the same article.
function reportStaleTranslation(error: HelpArticleFormatError): void {
  logger.warn(`A translated help article is left out, its readers get the English one: ${error.message}`)
}

function loadAtStartup(): Loaded {
  try {
    return { articles: assembleHelpArticles(SOURCES, HELP_CAPTURES, reportStaleTranslation) }
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
