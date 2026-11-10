import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'

interface BuildingListFooterProps {
  page: number
  pages: number
  pageSize: number
  total: number
}

/** Under the list: « 1 à 50 sur 1 284 » and the previous and next pages; just the count when it fits on one page. */
export function BuildingListFooter({ page, pages, pageSize, total }: BuildingListFooterProps) {
  const [params] = useSearchParams()
  const format = new Intl.NumberFormat(getLocale())
  const to = (target: number) => {
    const next = new URLSearchParams(params)
    if (target <= 1) next.delete('page')
    else next.set('page', String(target))
    const query = next.toString()
    return query === '' ? '.' : `?${query}`
  }

  const label =
    pages > 1
      ? m.prospection_range({
          from: format.format((page - 1) * pageSize + 1),
          to: format.format(Math.min(total, page * pageSize)),
          total: format.format(total),
        })
      : total === 1
        ? m.prospection_count_one()
        : m.prospection_count({ count: format.format(total) })

  return (
    <div className="flex items-center gap-1.5 px-1 text-faint text-sm tabular-nums">
      <span className="flex-1">{label}</span>
      {pages > 1 && (
        <>
          <PageLink to={to(page - 1)} disabled={page <= 1} label={m.prospection_previous_page()}>
            <ChevronLeft aria-hidden="true" />
          </PageLink>
          <PageLink to={to(page + 1)} disabled={page >= pages} label={m.prospection_next_page()}>
            <ChevronRight aria-hidden="true" />
          </PageLink>
        </>
      )}
    </div>
  )
}

function PageLink({
  to,
  disabled,
  label,
  children,
}: {
  to: string
  disabled: boolean
  label: string
  children: ReactNode
}) {
  if (disabled) {
    return (
      <Button variant="ghost" size="icon-sm" disabled aria-label={label}>
        {children}
      </Button>
    )
  }
  return (
    <Button asChild variant="ghost" size="icon-sm">
      <Link to={to} aria-label={label} preventScrollReset={false}>
        {children}
      </Link>
    </Button>
  )
}
