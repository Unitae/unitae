import { CircleHelp } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { HELP_PANEL_PARAM } from '~/features/help/model/help-links'
import { useCanOpenHelp } from '~/features/help/ui/HelpAccessProvider'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'

/**
 * The « ? » of a page, at the far right of its top bar. It opens the article in the side panel, keeping the page
 * beside it; nothing is drawn when the reader may not open that article.
 */
export function HelpEntryButton({ slug }: { slug: string }) {
  const allowed = useCanOpenHelp(slug)
  const { pathname, search } = useLocation()
  if (!allowed) return null

  const params = new URLSearchParams(search)
  params.set(HELP_PANEL_PARAM, slug)

  return (
    <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
      <Link
        to={{ pathname, search: `?${params.toString()}` }}
        preventScrollReset
        aria-label={m.help_entry_label()}
        title={m.help_entry_label()}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </Link>
    </Button>
  )
}
