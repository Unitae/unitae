import { TriangleAlert } from 'lucide-react'

import type { PioneerAnnualRow, PioneerAuxiliaryRow } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PioneerPaceChart } from './PioneerPaceChart'
import { PioneerRiskBadge, paceLabel, ReportingChip } from './pioneer-risk-badge'

interface Props {
  serviceYear: number
  annual?: PioneerAnnualRow
  auxiliary?: PioneerAuxiliaryRow
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-black text-3xl tracking-tight tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

export function PioneerActivitySection({ serviceYear, annual, auxiliary }: Props) {
  return (
    <Card id="activity">
      <CardHeader>
        <CardTitle>{m.pioneers_detail_title()}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {annual && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <PioneerRiskBadge bucket={annual.pace.riskBucket} label={paceLabel(annual.pace)} />
              <ReportingChip status={annual.pace.reportingStatus} />
            </div>
            <PioneerPaceChart
              serviceYear={serviceYear}
              monthlyHours={annual.pace.monthlyHours}
              rate={annual.monthlyRate}
            />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat value={`${annual.pace.actualToDate} h`} label={m.pioneers_ytd_label()} />
              <Stat value={`${annual.pace.targetToDate} h`} label={m.pioneers_target_label()} />
              <Stat
                value={`${Math.round(annual.pace.requiredAvgToFinish)} h`}
                label={m.pioneers_needs_per_month_label()}
              />
            </div>
            {annual.pace.outOfReach ? (
              <p className="flex items-center gap-2 text-amber-600 text-sm dark:text-amber-400">
                <TriangleAlert className="size-4 shrink-0" />
                {m.pioneers_out_of_reach()}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {m.pioneers_projection({
                  projected: String(Math.round(annual.pace.projectedYearEnd)),
                  goal: String(annual.pace.fullYearTarget),
                })}
              </p>
            )}
          </>
        )}
        {auxiliary && (
          <div className="grid grid-cols-2 gap-4">
            <Stat
              value={auxiliary.auxiliary.thisMonth ? `${auxiliary.auxiliary.thisMonth.hours} h` : '—'}
              label={m.pioneers_aux_standard_target({ rate: String(auxiliary.monthlyRate) })}
            />
            <Stat
              value={`${auxiliary.auxiliary.metMonths}/${auxiliary.auxiliary.enrolledMonths}`}
              label={m.pioneers_aux_months_label()}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
