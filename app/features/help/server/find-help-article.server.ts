import type { HelpArticle, HelpLocale } from '~/features/help/model/help.type'
import { canReadHelpArticle, type HelpReader } from '~/features/help/model/help-access'
import { helpArticlesIn } from '~/features/help/model/help-links'

export type HelpArticleLookup =
  | { kind: 'found'; article: HelpArticle; related: HelpArticle[] }
  /** The article exists but its feature is not open to this reader. Its title is not given. */
  | { kind: 'forbidden' }
  | { kind: 'missing' }

/**
 * Looks an article up by slug in the reader's language, or in English when that language lacks it. Refuses one the reader may not open, and
 * lists as related only the articles the reader may open.
 */
export function findHelpArticle(
  articles: readonly HelpArticle[],
  slug: string,
  locale: HelpLocale,
  reader: HelpReader,
): HelpArticleLookup {
  const inLocale = helpArticlesIn(articles, locale)
  const article = inLocale.find(candidate => candidate.slug === slug)
  if (!article) return { kind: 'missing' }
  if (!canReadHelpArticle(article, reader)) return { kind: 'forbidden' }

  const related = article.related
    .map(relatedSlug => inLocale.find(candidate => candidate.slug === relatedSlug))
    .filter((candidate): candidate is HelpArticle => candidate != null && canReadHelpArticle(candidate, reader))

  return { kind: 'found', article, related }
}
