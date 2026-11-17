import type { HelpArticle, HelpLocale } from '~/features/help/model/help.type'
import { canReadHelpArticle } from '~/features/help/model/help-access'
import type { Permission } from '~/shared/types/permission'

export type HelpArticleLookup =
  | { kind: 'found'; article: HelpArticle; related: HelpArticle[] }
  /** The article exists but its feature is not open to this reader. Its title is not given. */
  | { kind: 'forbidden' }
  | { kind: 'missing' }

/**
 * Looks an article up by slug in the reader's language. Refuses one whose permission the reader does not hold, and
 * lists as related only the articles the reader may open.
 */
export function findHelpArticle(
  articles: readonly HelpArticle[],
  slug: string,
  locale: HelpLocale,
  permissions: ReadonlySet<Permission>,
): HelpArticleLookup {
  const inLocale = articles.filter(article => article.locale === locale)
  const article = inLocale.find(candidate => candidate.slug === slug)
  if (!article) return { kind: 'missing' }
  if (!canReadHelpArticle(article, permissions)) return { kind: 'forbidden' }

  const related = article.related
    .map(relatedSlug => inLocale.find(candidate => candidate.slug === relatedSlug))
    .filter((candidate): candidate is HelpArticle => candidate != null && canReadHelpArticle(candidate, permissions))

  return { kind: 'found', article, related }
}
