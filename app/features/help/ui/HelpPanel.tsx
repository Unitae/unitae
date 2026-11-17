import { SidePanel } from '@unitae/ui'
import { useEffect } from 'react'
import { Link, useFetcher, useLocation, useSearchParams } from 'react-router'
import type { HelpArticleView } from '~/features/help/model/help.type'
import { HELP_PANEL_PARAM, helpPagePath } from '~/features/help/model/help-links'
import { HelpArticleBody } from '~/features/help/ui/HelpArticleBody'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { useMediaQuery } from '~/shared/ui/hooks/use-media-query'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/shared/ui/sheet'

/** From this width the article docks beside the page, as a row-opened panel does; below, it rises as a sheet. */
const DOCKED = '(min-width: 1280px)'

/**
 * The article named by `?aide=<slug>`, opened beside the page. It reads the article from the article route, so the
 * panel and the article page show the same text, and the access check is the server's.
 */
export function HelpPanel() {
  const [params, setParams] = useSearchParams()
  const { pathname, search } = useLocation()
  const slug = params.get(HELP_PANEL_PARAM)
  const docked = useMediaQuery(DOCKED) === true
  const fetcher = useFetcher<HelpArticleView>()

  // biome-ignore lint/correctness/useExhaustiveDependencies: loads once per opened article; the fetcher is fresh each render
  useEffect(() => {
    if (slug) fetcher.load(helpPagePath(slug))
  }, [slug])

  if (!slug) return null

  const view = fetcher.data
  const title = view?.kind === 'found' ? view.title : m.help_page_title()
  const summary = view?.kind === 'found' ? view.summary : undefined

  function close() {
    setParams(
      prev => {
        prev.delete(HELP_PANEL_PARAM)
        return prev
      },
      { preventScrollReset: true },
    )
  }

  // Related articles replace the open one in the panel, at the same page.
  const relatedTo = (relatedSlug: string) => {
    const next = new URLSearchParams(search)
    next.set(HELP_PANEL_PARAM, relatedSlug)
    return `${pathname}?${next.toString()}`
  }

  const openPage = (
    <Button asChild variant="outline" size="sm">
      <Link to={helpPagePath(slug)}>{m.help_open_page()}</Link>
    </Button>
  )

  if (docked) {
    return (
      <SidePanel
        key={slug}
        title={title}
        description={summary}
        closeLabel={m.common_close()}
        onClose={close}
        actions={openPage}
      >
        <div className="p-4">
          <HelpArticleBody view={view} relatedTo={relatedTo} />
        </div>
      </SidePanel>
    )
  }

  return (
    <Sheet open onOpenChange={next => !next && close()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {summary && <SheetDescription>{summary}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="mb-4">{openPage}</div>
          <HelpArticleBody view={view} relatedTo={relatedTo} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
