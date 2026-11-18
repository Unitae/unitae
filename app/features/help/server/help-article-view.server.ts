import type { HelpArticle, HelpArticleView, HelpLocale } from '~/features/help/model/help.type'
import type { HelpReader } from '~/features/help/model/help-access'
import { findHelpArticle } from '~/features/help/server/find-help-article.server'
import { HELP_CAPTURES } from '~/features/help/server/help-captures.server'
import { renderHelpMarkdown } from '~/features/help/server/render-help-markdown.server'

/** The article as a page or the side panel draws it. The body is rendered here, so nothing unrendered reaches the client. */
export function helpArticleView(
  articles: readonly HelpArticle[],
  slug: string,
  locale: HelpLocale,
  reader: HelpReader,
): HelpArticleView {
  const lookup = findHelpArticle(articles, slug, locale, reader)
  if (lookup.kind === 'forbidden') return { kind: 'forbidden', slug }
  if (lookup.kind === 'missing') return { kind: 'missing', slug }

  const { article, related } = lookup
  return {
    kind: 'found',
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    module: article.module,
    html: renderHelpMarkdown(article.body, { locale: article.locale, captures: HELP_CAPTURES[article.locale] }),
    related: related.map(({ slug: relatedSlug, title }) => ({ slug: relatedSlug, title })),
  }
}
