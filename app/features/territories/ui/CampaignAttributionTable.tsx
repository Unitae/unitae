import { Avatar, SectionHeading } from '@unitae/ui'
import { useState } from 'react'
import { Link } from 'react-router'

import { formatCampaignDay } from '~/features/territories/model/campaign-days'
import * as m from '~/i18n/paraglide/messages'
import { type QuickView, QuickViews } from '~/shared/ui/QuickViews'
import { openRowOnClick } from '~/shared/ui/row-click'
import { daysBetween } from '~/shared/utils/calendar-day'
import { cn } from '~/shared/utils/utils'

export interface CampaignAttributionRow {
  id: number
  territory: { id: number; number: string }
  publisher: string
  /** `YYYY-MM-DD`. */
  startDay: string
  endDay: string | null
}

type Filter = 'all' | 'out' | 'back'

const HEAD = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const CELL = 'h-12 whitespace-nowrap border-border border-b px-3.5 group-last:border-b-0'

/** The campaign's attributions, newest first: who holds each territory, since when, and when it came back. */
export function CampaignAttributionTable({ rows, today }: { rows: CampaignAttributionRow[]; today: string }) {
  const [filter, setFilter] = useState<Filter>('all')
  const out = rows.filter(row => row.endDay == null)
  const back = rows.filter(row => row.endDay != null)
  const shown = filter === 'out' ? out : filter === 'back' ? back : rows
  const filters: QuickView<Filter>[] = [
    { value: 'all', label: m.campaigns_attr_filter_all(), count: rows.length },
    { value: 'out', label: m.campaigns_attr_filter_out(), count: out.length },
    { value: 'back', label: m.campaigns_attr_filter_back(), count: back.length },
  ]

  return (
    <section className="flex flex-col gap-2.5">
      <SectionHeading
        title={m.campaigns_attributions_title()}
        meta={<span className="tabular-nums">{rows.length}</span>}
        actions={
          rows.length > 0 && (
            <QuickViews
              label={m.campaigns_attr_filter_label()}
              views={filters}
              value={filter}
              onChoose={setFilter}
              size="sm"
            />
          )
        }
      />
      {shown.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-5 text-muted-foreground text-sm">
          {filter === 'out'
            ? m.campaigns_attr_none_out()
            : filter === 'back'
              ? m.campaigns_attr_none_back()
              : m.campaigns_view_attributions_empty()}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={HEAD}>{m.campaigns_attr_territory()}</th>
                <th className={HEAD}>{m.campaigns_attr_publisher()}</th>
                <th className={cn(HEAD, 'max-sm:hidden')}>{m.campaigns_attr_out_on()}</th>
                <th className={HEAD}>{m.campaigns_attr_back()}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(row => (
                <tr
                  onClick={openRowOnClick}
                  key={row.id}
                  className="group relative cursor-pointer transition-colors duration-(--u-duration-fast) hover:bg-hover"
                >
                  <td className={CELL}>
                    <Link
                      to={`/territories/attributions/${row.id}/edit`}
                      data-row-primary
                      className="font-medium tabular-nums outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {row.territory.number}
                    </Link>
                  </td>
                  <td className={CELL}>
                    <span className="inline-flex items-center gap-2">
                      <Avatar name={row.publisher} />
                      {row.publisher}
                    </span>
                  </td>
                  <td className={cn(CELL, 'text-muted-foreground tabular-nums max-sm:hidden')}>
                    {formatCampaignDay(row.startDay)}
                  </td>
                  <td className={cn(CELL, 'tabular-nums')}>
                    {row.endDay != null ? (
                      <span className="text-muted-foreground">{formatCampaignDay(row.endDay)}</span>
                    ) : (
                      <span className="text-faint text-sm">{outSince(row.startDay, today)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function outSince(startDay: string, today: string): string {
  const count = Math.max(0, daysBetween(startDay, today))
  if (count === 0) return m.campaigns_attr_out_today()
  return count > 1 ? m.campaigns_attr_out_since_other({ count }) : m.campaigns_attr_out_since_one({ count })
}
