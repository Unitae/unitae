import { Link } from 'react-router'

import type { PioneerAnnualRow } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Badge } from '~/shared/ui/badge'
import { Separator } from '~/shared/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/shared/ui/tooltip'
import { formatGroupName } from '~/shared/utils/format-group-name'

import { PioneerRiskBadge, paceLabel, ReportingChip } from './pioneer-risk-badge'
import { Sparkline } from './Sparkline'

const TYPE_META: Partial<Record<PublisherType, { code: string; label: () => string }>> = {
  [PublisherType.PionnierPermanant]: { code: 'PP', label: () => m.pioneers_type_permanent() },
  [PublisherType.PionnierSpecial]: { code: 'PS', label: () => m.pioneers_type_special() },
  [PublisherType.Missionnaire]: { code: 'M', label: () => m.pioneers_type_missionary() },
}

function detailUrl(memberId: number) {
  return `/publishers/${memberId}/view#activity`
}

function rowTint(row: PioneerAnnualRow): string {
  if (row.concluded) return 'text-muted-foreground'
  if (row.pace.riskBucket === 'red') return 'bg-destructive/10 dark:bg-destructive/5'
  if (row.pace.riskBucket === 'amber') return 'bg-amber-500/10 dark:bg-amber-400/5'
  return ''
}

function TypeBadge({ type }: { type: PublisherType }) {
  const meta = TYPE_META[type]
  if (!meta) return null
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline">{meta.code}</Badge>
        </TooltipTrigger>
        <TooltipContent>{meta.label()}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Group + enrolled months (or the concluded marker) — the "who shepherds them" context.
function SubLine({ row }: { row: PioneerAnnualRow }) {
  const enrolled = row.concluded
    ? m.pioneers_concluded()
    : m.pioneers_enrolled_months({ count: String(row.pace.elapsedEnrolled) })
  return (
    <div className="text-muted-foreground text-xs">
      {row.groupName ? `${formatGroupName(row.groupName)} · ` : ''}
      {enrolled}
    </div>
  )
}

// Risk + reporting badges, plus the actionable catch-up line for off-pace pioneers.
function StatusCell({ row }: { row: PioneerAnnualRow }) {
  if (row.concluded) return <Badge variant="outline">{m.pioneers_concluded()}</Badge>
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <PioneerRiskBadge bucket={row.pace.riskBucket} label={paceLabel(row.pace)} />
        <ReportingChip status={row.pace.reportingStatus} />
      </div>
      {row.pace.riskBucket !== 'green' && (
        <span className="text-muted-foreground text-xs">
          {row.pace.outOfReach
            ? m.pioneers_out_of_reach_short()
            : m.pioneers_needs_per_month({ hours: String(Math.round(row.pace.requiredAvgToFinish)) })}
        </span>
      )}
    </div>
  )
}

export function PioneerAnnualSection({ rows }: { rows: PioneerAnnualRow[] }) {
  if (rows.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display font-semibold text-lg">{m.pioneers_section_annual()}</h2>
        <Badge variant="secondary">{rows.filter(r => !r.concluded).length}</Badge>
      </div>
      <Separator />

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.pioneers_col_pioneer()}</TableHead>
              <TableHead>{m.pioneers_col_type()}</TableHead>
              <TableHead>{m.pioneers_col_status()}</TableHead>
              <TableHead>{m.pioneers_col_hours()}</TableHead>
              <TableHead>{m.pioneers_col_trend()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.memberId} className={rowTint(row)}>
                <TableCell>
                  <Link to={detailUrl(row.memberId)} className="font-medium hover:text-primary">
                    {row.firstname} {row.lastname}
                  </Link>
                  <SubLine row={row} />
                </TableCell>
                <TableCell>
                  <TypeBadge type={row.type} />
                </TableCell>
                <TableCell>
                  <StatusCell row={row} />
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {row.pace.actualToDate} / {row.pace.targetToDate} h
                </TableCell>
                <TableCell>
                  <Sparkline values={row.pace.monthlyHours} rate={row.monthlyRate} risk={row.pace.riskBucket} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map(row => (
          <Link
            key={row.memberId}
            to={detailUrl(row.memberId)}
            className={`flex flex-col gap-2 rounded-lg border p-3 ${rowTint(row)}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {row.firstname} {row.lastname}
              </span>
              <Badge variant="outline">{TYPE_META[row.type]?.label() ?? row.type}</Badge>
            </div>
            <SubLine row={row} />
            <StatusCell row={row} />
            <div className="flex items-center justify-between text-muted-foreground text-sm">
              <span className="tabular-nums">
                {row.pace.actualToDate} / {row.pace.targetToDate} h
              </span>
              <Sparkline values={row.pace.monthlyHours} rate={row.monthlyRate} risk={row.pace.riskBucket} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
