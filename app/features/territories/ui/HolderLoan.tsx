import { Status, Tag } from '@unitae/ui'

import type { TerritoryStatus } from '~/features/territories/server/my-territories.server'
import {
  dueLabel,
  LOAN_STYLE,
  loanDay,
  territoryKindLabel,
  territoryQuantityLabel,
} from '~/features/territories/ui/my-territory-labels'
import * as m from '~/i18n/paraglide/messages'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { elapsedPercent } from '~/shared/utils/elapsed-percent'
import { cn } from '~/shared/utils/utils'

/** A territory's loan to its holder: when it started, when it is due back, and whether a campaign paused it. */
export interface HolderLoan {
  startDate: Date | string
  lateDate: Date | string
  pausedAt: Date | string | null
  status: TerritoryStatus
}

/** How much of the loan has gone; a paused loan's clock stopped on the day of the pause. */
function loanProgress(loan: HolderLoan): number {
  return loan.pausedAt != null
    ? elapsedPercent(loan.startDate, loan.lateDate, new Date(loan.pausedAt))
    : elapsedPercent(loan.startDate, loan.lateDate)
}

export function LoanBar({ loan, className }: { loan: HolderLoan; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('block h-1 overflow-hidden rounded-full bg-hover', className)}>
      <span
        className={cn('block h-full rounded-full', loan.pausedAt != null ? 'bg-faint' : LOAN_STYLE[loan.status].bar)}
        style={{ width: `${loanProgress(loan)}%` }}
      />
    </span>
  )
}

interface LoanStatusProps {
  loan: HolderLoan
  timeZone: string
  form?: 'short' | 'long'
  /** Where the time left goes: after a separator inside the status, or as its own quieter line. */
  relative?: 'inline' | 'apart'
}

/** « À rendre le 23 nov. », « En retard depuis le 3 sept. » or « En pause depuis le 2 nov. », with the time left. */
export function LoanStatus({ loan, timeZone, form = 'short', relative = 'apart' }: LoanStatusProps) {
  if (loan.pausedAt != null) {
    return (
      <Status tone="neutral" className="text-foreground">
        {m.my_territories_paused_since({ date: loanDay(loan.pausedAt, timeZone, form) })}
      </Status>
    )
  }
  const timeLeft = <RelativeTime date={loan.lateDate} />
  return (
    <>
      {/* It wraps: beside a long title on a phone, the time left goes under the date. */}
      <Status tone={LOAN_STYLE[loan.status].tone} className="items-baseline whitespace-normal text-foreground">
        <span>
          {dueLabel(loan.status, loan.lateDate, timeZone, form)}
          {relative === 'inline' && <span className="whitespace-nowrap text-faint"> · {timeLeft}</span>}
        </span>
      </Status>
      {relative === 'apart' && <span className="text-faint text-xs">{timeLeft}</span>}
    </>
  )
}

interface HolderTerritoryFactsProps {
  type: string
  totals: { homes: number; phones: number; entrances: number }
  loan: HolderLoan
  campaignName: string | null
  byPhone: boolean
  timeZone: string
}

/** The line under a territory's title: its kind, its size, its loan, and the loan's span drawn as a bar. */
export function HolderTerritoryFacts({
  type,
  totals,
  loan,
  campaignName,
  byPhone,
  timeZone,
}: HolderTerritoryFactsProps) {
  return (
    <>
      <span>{territoryKindLabel(type)}</span>
      <span className="tabular-nums">{territoryQuantityLabel(type, totals)}</span>
      <span className="tabular-nums">
        {totals.entrances > 1
          ? m.territories_content_entrances_other({ count: totals.entrances })
          : m.territories_content_entrances_one({ count: totals.entrances })}
      </span>
      <span>{m.my_territories_attributed_on({ date: loanDay(loan.startDate, timeZone, 'long') })}</span>
      {campaignName != null && <Tag>{campaignName || m.attributions_type_campaign()}</Tag>}
      {byPhone && <Tag>{m.attributions_type_phone()}</Tag>}
      <span className="flex basis-full items-center gap-2.5 text-faint text-xs tabular-nums">
        {loanDay(loan.startDate, timeZone)}
        <LoanBar loan={loan} className="w-48 sm:w-64" />
        {loanDay(loan.lateDate, timeZone)}
      </span>
    </>
  )
}
