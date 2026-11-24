import { Link } from 'react-router'
import { demoHelpLimit } from '~/features/demo'
import { answersForASchedule } from '~/features/events/index.server'
import type { HelpArticleView } from '~/features/help/model/help.type'
import { helpLocaleFor, helpPagePath } from '~/features/help/model/help-links'
import { helpArticleView } from '~/features/help/server/help-article-view.server'
import { loadHelpArticles } from '~/features/help/server/help-content.server'
import { helpReaderFor } from '~/features/help/server/help-reader.server'
import { HelpArticleBody } from '~/features/help/ui/HelpArticleBody'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { isDemoCongregation } from '~/shared/domain/demo-mode.server'
import { logger } from '~/shared/infra/logger.server'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import { RouteErrorBoundary } from '~/shared/ui/RouteErrorBoundary'

import type { Route } from './+types/article'

// A forbidden or missing article keeps the generic title: its own title never reaches the tab.
export const meta: Route.MetaFunction = ({ loaderData }) => {
  const title =
    loaderData?.kind === 'found' ? m.help_article_meta_title({ title: loaderData.title }) : m.help_meta_title()
  return [{ title }]
}

// The same loader serves the page and the side panel, which reads it as data. An article that cannot be read is
// answered as an error rather than thrown: a thrown error would replace the page the panel was opened from.
export async function loader({ params, context }: Route.LoaderArgs): Promise<HelpArticleView> {
  try {
    const account = context.get(currentAccountContext)
    const answers = await withScopeFromContext(context, (db, congregationId) =>
      answersForASchedule(db, account.id, congregationId),
    )
    const reader = helpReaderFor(context.get(permissionsContext), account, answers)
    const view = helpArticleView(loadHelpArticles(), params.slug, helpLocaleFor(getLocale()), reader)
    if (view.kind !== 'found' || !isDemoCongregation(context.get(congregationContext))) return view
    return { ...view, demoLimit: demoHelpLimit(view.slug) }
  } catch (error) {
    logger.error(`In-app help article « ${params.slug} » could not be read: ${String(error)}`)
    return { kind: 'error', slug: params.slug }
  }
}

// A direct visit to the article page: an unexpected failure is drawn inside the shell, like any page's.
export function ErrorBoundary() {
  return <RouteErrorBoundary />
}

export default function HelpArticlePage({ loaderData }: Route.ComponentProps) {
  const view = loaderData

  if (view.kind !== 'found') {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <PageHeader title={m.help_page_title()} breadcrumbs={[{ label: m.help_page_title(), to: helpPagePath() }]} />
        <HelpArticleBody view={view} relatedTo={helpPagePath} />
        <Button asChild variant="ghost" className="self-start">
          <Link to={helpPagePath()}>{m.help_back_to_help()}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={view.title}
        subtitle={view.summary}
        breadcrumbs={[{ label: m.help_page_title(), to: helpPagePath() }, { label: view.title }]}
      />
      <HelpArticleBody view={view} relatedTo={helpPagePath} />
    </div>
  )
}
