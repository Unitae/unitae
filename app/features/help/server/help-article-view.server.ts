import type { HelpArticle, HelpArticleView, HelpLocale } from '~/features/help/model/help.type'
import { findHelpArticle } from '~/features/help/server/find-help-article.server'
import { renderHelpMarkdown } from '~/features/help/server/render-help-markdown.server'
import type { Permission } from '~/shared/types/permission'

/** The article as a page or the side panel draws it. The body is rendered here, so nothing unrendered reaches the client. */
export function helpArticleView(
  articles: readonly HelpArticle[],
  slug: string,
  locale: HelpLocale,
  permissions: ReadonlySet<Permission>,
): HelpArticleView {
  const lookup = findHelpArticle(articles, slug, locale, permissions)
  if (lookup.kind !== 'found') return lookup

  const { article, related } = lookup
  return {
    kind: 'found',
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    module: article.module,
    html: renderHelpMarkdown(article.body),
    related: related.map(({ slug: relatedSlug, title }) => ({ slug: relatedSlug, title })),
  }
}
