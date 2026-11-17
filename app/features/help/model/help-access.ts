import type { HelpArticle } from '~/features/help/model/help.type'
import { Permission } from '~/shared/types/permission'

/**
 * An article follows the permission of its feature. A reader who does not hold it does not see the article in the
 * list, in the search, or as a related link, and cannot open it. No permission is changed to show help.
 */
export function canReadHelpArticle(article: HelpArticle, permissions: ReadonlySet<Permission>): boolean {
  if (article.permission == null) return true
  return permissions.has(Permission[article.permission])
}

export function visibleHelpArticles(
  articles: readonly HelpArticle[],
  permissions: ReadonlySet<Permission>,
): HelpArticle[] {
  return articles.filter(article => canReadHelpArticle(article, permissions))
}

/** The slugs a reader may open, in one list: what the « ? » entry points on each page check against. */
export function visibleHelpSlugs(articles: readonly HelpArticle[], permissions: ReadonlySet<Permission>): string[] {
  return visibleHelpArticles(articles, permissions).map(({ slug }) => slug)
}
