import { TriangleAlert } from 'lucide-react'

import type { PioneerActivity, PioneerAnnualRow, PioneerAuxiliaryRow } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PioneerPaceChart } from './PioneerPaceChart'
import { PioneerRiskBadge, paceLabel, ReportingChip } from './pioneer-risk-badge'

interface Props {
  serviceYear: number
  activity: PioneerActivity
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-black text-3xl tracking-tight tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

export function PioneerActivitySection({ serviceYear, activity }: Props) {
  return (
    <Card id="activity">
      <CardHeader>
        <CardTitle>{m.pioneers_detail_title()}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {activity.kind === 'annual' ? (
          <AnnualDetail serviceYear={serviceYear} row={activity.row} />
        ) : (
          <AuxiliaryDetail row={activity.row} />
        )}
      </CardContent>
    </Card>
  )
}

function AnnualDetail({ serviceYear, row }: { serviceYear: number; row: PioneerAnnualRow }) {
  const { pace } = row
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <PioneerRiskBadge bucket={pace.riskBucket} label={paceLabel(pace)} />
        <ReportingChip status={pace.reportingStatus} />
      </div>
      <PioneerPaceChart serviceYear={serviceYear} monthlyHours={pace.monthlyHours} rate={row.monthlyRate} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat value={`${pace.actualToDate} h`} label={m.pioneers_ytd_label()} />
        <Stat value={`${pace.targetToDate} h`} label={m.pioneers_target_label()} />
        <Stat value={`${Math.round(pace.requiredAvgToFinish)} h`} label={m.pioneers_needs_per_month_label()} />
      </div>
      {pace.outOfReach ? (
        <p className="flex items-center gap-2 text-amber-600 text-sm dark:text-amber-400">
          <TriangleAlert className="size-4 shrink-0" />
          {m.pioneers_out_of_reach()}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          {m.pioneers_projection({
            projected: String(Math.round(pace.projectedYearEnd)),
            goal: String(pace.fullYearTarget),
          })}
        </p>
      )}
    </>
  )
}

function AuxiliaryDetail({ row }: { row: PioneerAuxiliaryRow }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Stat
        value={row.auxiliary.thisMonth ? `${row.auxiliary.thisMonth.hours} h` : '—'}
        label={m.pioneers_aux_standard_target({ rate: String(row.monthlyRate) })}
      />
      <Stat
        value={`${row.auxiliary.metMonths}/${row.auxiliary.enrolledMonths}`}
        label={m.pioneers_aux_months_label()}
      />
    </div>
  )
}
