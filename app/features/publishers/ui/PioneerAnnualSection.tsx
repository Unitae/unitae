import { Link } from 'react-router'

import type { PioneerAnnualRow } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Badge } from '~/shared/ui/badge'
import { Separator } from '~/shared/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/shared/ui/tooltip'

import { PioneerRiskBadge, paceLabel, ReportingChip } from './pioneer-risk-badge'
import { Sparkline } from './Sparkline'

const TYPE_META: Partial<Record<PublisherType, { code: string; label: () => string }>> = {
  [PublisherType.PionnierPermanant]: { code: 'PP', label: () => m.pioneers_type_permanent() },
  [PublisherType.PionnierSpecial]: { code: 'PS', label: () => m.pioneers_type_special() },
  [PublisherType.Missionnaire]: { code: 'M', label: () => m.pioneers_type_missionary() },
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

function detailUrl(memberId: number) {
  return `/publishers/${memberId}/view#activity`
}

function RowContent({ row }: { row: PioneerAnnualRow }) {
  return (
    <>
      <PioneerRiskBadge bucket={row.pace.riskBucket} label={paceLabel(row.pace)} />
      <ReportingChip status={row.pace.reportingStatus} />
    </>
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
              <TableRow
                key={row.memberId}
                className={
                  row.pace.riskBucket === 'red' && !row.concluded
                    ? 'bg-destructive/10 dark:bg-destructive/5'
                    : row.concluded
                      ? 'text-muted-foreground'
                      : ''
                }
              >
                <TableCell>
                  <Link to={detailUrl(row.memberId)} className="font-medium hover:text-primary">
                    {row.firstname} {row.lastname}
                  </Link>
                  <div className="text-muted-foreground text-xs">
                    {row.concluded
                      ? m.pioneers_concluded()
                      : m.pioneers_enrolled_months({ count: String(row.pace.elapsedEnrolled) })}
                  </div>
                </TableCell>
                <TableCell>
                  <TypeBadge type={row.type} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.concluded ? '—' : <RowContent row={row} />}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {row.pace.actualToDate} / {row.pace.targetToDate} h
                </TableCell>
                <TableCell>
                  <Sparkline values={row.pace.monthlyHours} rate={row.monthlyRate} />
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
            className={`flex flex-col gap-2 rounded-lg border p-3 ${row.pace.riskBucket === 'red' && !row.concluded ? 'bg-destructive/10 dark:bg-destructive/5' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {row.firstname} {row.lastname}
              </span>
              <TypeBadge type={row.type} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {row.concluded ? m.pioneers_concluded() : <RowContent row={row} />}
            </div>
            <div className="flex items-center justify-between text-muted-foreground text-sm">
              <span className="tabular-nums">
                {row.pace.actualToDate} / {row.pace.targetToDate} h
              </span>
              <Sparkline values={row.pace.monthlyHours} rate={row.monthlyRate} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
