import { Link } from 'react-router'

import { helpLocaleFor, helpPagePath } from '~/features/help/model/help-links'
import { helpArticleView } from '~/features/help/server/help-article-view.server'
import { loadHelpArticles } from '~/features/help/server/help-content.server'
import { HelpArticleBody } from '~/features/help/ui/HelpArticleBody'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/article'

// The same loader serves the page and the side panel, which reads it as data.
export function loader({ params, context }: Route.LoaderArgs) {
  return helpArticleView(loadHelpArticles(), params.slug, helpLocaleFor(getLocale()), context.get(permissionsContext))
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
