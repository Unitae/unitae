import { GROUP_LEADER, type HelpArticle, type HelpLocale, SCHEDULE_RESPONSIBLE } from '~/features/help/model/help.type'
import { helpArticlesIn } from '~/features/help/model/help-links'
import { Permission } from '~/shared/types/permission'

/** Who is reading: their permissions, and whether they lead a field service group, which no permission says. */
export interface HelpReader {
  permissions: ReadonlySet<Permission>
  /** Overseer or assistant of a group: they enter its reports without holding a right. */
  leadsGroup: boolean
  /** Holds a role a schedule template names: they fill and publish its schedules without holding a right. */
  answersForSchedule: boolean
}

/**
 * An article follows the permission of its feature, or any one of its permissions when the feature opens to several
 * rights, or to group leaders, or to a schedule template's responsibles. A reader who holds none of them does not see the article in the list, in the search, or
 * as a related link, and cannot open it. No permission is changed to show help.
 */
export function canReadHelpArticle(article: HelpArticle, reader: HelpReader): boolean {
  if (article.permission == null) return true
  return article.permission.some(name => {
    if (name === GROUP_LEADER) return reader.leadsGroup
    if (name === SCHEDULE_RESPONSIBLE) return reader.answersForSchedule
    return reader.permissions.has(Permission[name])
  })
}

export function visibleHelpArticles(articles: readonly HelpArticle[], reader: HelpReader): HelpArticle[] {
  return articles.filter(article => canReadHelpArticle(article, reader))
}

/**
 * The slugs a reader may open in one language, each once: what the « ? » entry points check against. A slug that
 * exists in both languages is listed once, since the « ? » picks the language itself.
 */
export function visibleHelpSlugs(articles: readonly HelpArticle[], reader: HelpReader, locale: HelpLocale): string[] {
  const inLocale = helpArticlesIn(articles, locale)
  return [...new Set(visibleHelpArticles(inLocale, reader).map(({ slug }) => slug))]
}
