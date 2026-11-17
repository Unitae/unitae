import { Link } from 'react-router'
import type { HelpArticle } from '~/features/help/model/help.type'
import { visibleHelpArticles } from '~/features/help/model/help-access'
import { helpLocaleFor, helpPagePath } from '~/features/help/model/help-links'
import { groupHelpArticlesByModule } from '~/features/help/model/help-modules'
import { searchHelpArticles } from '~/features/help/model/search-help-articles'
import { loadHelpArticles } from '~/features/help/server/help-content.server'
import { HelpFallback } from '~/features/help/ui/HelpFallback'
import { helpModuleLabel } from '~/features/help/ui/help-module-label'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SearchInput } from '~/shared/ui/SearchInput'

import type { Route } from './+types/index'

interface HelpListItem {
  slug: string
  title: string
  summary: string
  module: HelpArticle['module']
}

function toListItem({ slug, title, summary, module }: HelpArticle): HelpListItem {
  return { slug, title, summary, module }
}

// Only the articles the reader may see are listed, grouped or searched: the rest does not exist for them.
export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const locale = helpLocaleFor(getLocale())
  const query = new URL(request.url).searchParams.get('q') ?? ''
  const visible = visibleHelpArticles(
    loadHelpArticles().filter(article => article.locale === locale),
    permissions,
  )

  return {
    query,
    groups: groupHelpArticlesByModule(visible).map(({ module, articles }) => ({
      module,
      articles: articles.map(toListItem),
    })),
    results: searchHelpArticles(visible, query).map(toListItem),
  }
}

export default function HelpIndexPage({ loaderData }: Route.ComponentProps) {
  const { query, groups, results } = loaderData
  const searching = query.trim() !== ''

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={m.help_page_title()}
        subtitle={m.help_page_intro()}
        breadcrumbs={[{ label: m.help_page_title() }]}
      />

      <SearchInput placeholder={m.help_search_label()} />

      {searching ? (
        results.length > 0 ? (
          <HelpList items={results} />
        ) : (
          <EmptyState
            title={m.help_search_empty({ query: query.trim() })}
            description={m.help_search_try()}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to={helpPagePath()}>{m.help_browse_all()}</Link>
              </Button>
            }
          />
        )
      ) : (
        groups.map(group => (
          <section key={group.module} aria-labelledby={`help-module-${group.module}`} className="flex flex-col gap-2">
            <h2 id={`help-module-${group.module}`} className="font-medium text-muted-foreground text-sm">
              {helpModuleLabel(group.module)}
            </h2>
            <HelpList items={group.articles} />
          </section>
        ))
      )}

      <HelpFallback />
    </div>
  )
}

function HelpList({ items }: { items: HelpListItem[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map(item => (
        <li key={item.slug}>
          <Link
            to={helpPagePath(item.slug)}
            className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-hover"
          >
            <span className="font-medium text-foreground text-sm">{item.title}</span>
            <span className="text-muted-foreground text-sm">{item.summary}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
