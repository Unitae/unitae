import { ProgressBar, Tag } from '@unitae/ui'
import { Link } from 'react-router'

import { campaignLength, formatCampaignDay, formatCampaignRange } from '~/features/territories/model/campaign-days'
import type { CampaignStatus } from '~/features/territories/model/campaign-status'
import * as m from '~/i18n/paraglide/messages'
import { openRowOnClick } from '~/shared/ui/row-click'
import { cn } from '~/shared/utils/utils'

export interface CampaignListRow {
  id: number
  name: string
  /** `YYYY-MM-DD`. */
  startDay: string
  endDay: string
  endedDay: string | null
  status: CampaignStatus
  /** Territories it names; 0 for every territory. */
  scopeCount: number
  /** Not shown before it starts. */
  coverage: { worked: number; total: number } | null
}

const HEAD = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const CELL = 'h-14 whitespace-nowrap border-border border-b px-3.5 group-last:border-b-0'

/** The campaigns, newest first: each with its days, its scope, how much of it is covered, and where it stands. */
export function CampaignTable({ rows }: { rows: CampaignListRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={HEAD}>{m.campaigns_table_campaign()}</th>
            <th className={cn(HEAD, 'max-md:hidden')}>{m.campaigns_table_scope()}</th>
            <th className={cn(HEAD, 'max-sm:hidden')}>{m.campaigns_table_coverage()}</th>
            <th className={HEAD}>{m.campaigns_table_status()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const length = campaignLength(row.startDay, row.endDay)
            return (
              <tr
                key={row.id}
                onClick={openRowOnClick}
                className="group relative cursor-pointer transition-colors duration-(--u-duration-fast) hover:bg-hover"
              >
                <td className={cn(CELL, 'max-md:whitespace-normal')}>
                  <Link
                    to={`/territories/attributions/campaigns/${row.id}`}
                    data-row-primary
                    className="flex flex-col gap-0.5 py-1 outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-medium">{row.name}</span>
                    <span className="text-faint text-sm tabular-nums">
                      {formatCampaignRange(row.startDay, row.endDay)} · {m.campaigns_length({ count: length })}
                    </span>
                  </Link>
                </td>
                <td className={cn(CELL, 'text-muted-foreground max-md:hidden')}>
                  {row.scopeCount === 0
                    ? m.campaigns_scope_all()
                    : row.scopeCount > 1
                      ? m.campaigns_scope_count({ count: row.scopeCount })
                      : m.campaigns_scope_one({ count: row.scopeCount })}
                </td>
                <td className={cn(CELL, 'max-sm:hidden')}>
                  {row.coverage == null ? (
                    <span className="text-faint">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <ProgressBar value={row.coverage.worked} max={Math.max(row.coverage.total, 1)} className="w-24" />
                      <span className="text-muted-foreground tabular-nums">
                        {m.campaigns_coverage_value({
                          worked: row.coverage.worked,
                          total: row.coverage.total,
                          percent:
                            row.coverage.total === 0 ? 0 : Math.round((row.coverage.worked / row.coverage.total) * 100),
                        })}
                      </span>
                    </span>
                  )}
                </td>
                <td className={CELL}>
                  <State row={row} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function State({ row }: { row: CampaignListRow }) {
  // « jusqu’au 29 nov. », « Terminée le 25 août »: the day is enough, its weekday is noise here.
  const short = (day: string) => formatCampaignDay(day, { day: 'numeric', month: 'short' })
  if (row.status === 'active') {
    return (
      <Tag tone="brand" className="gap-1.5">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
        {m.campaigns_state_active_until({ date: short(row.endDay) })}
      </Tag>
    )
  }
  if (row.status === 'scheduled') return <Tag>{m.campaigns_state_scheduled_from({ date: short(row.startDay) })}</Tag>
  return (
    <span className="text-faint text-sm">
      {m.campaigns_state_ended_on({ date: short(row.endedDay ?? row.endDay) })}
    </span>
  )
}
