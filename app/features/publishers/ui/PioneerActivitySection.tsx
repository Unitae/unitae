import { TriangleAlert } from 'lucide-react'

import type { PioneerActivity, PioneerAnnualRow, PioneerAuxiliaryRow } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Badge } from '~/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { PioneerPaceChart } from './PioneerPaceChart'
import { PioneerRiskBadge, paceLabel, ReportingChip } from './pioneer-risk-badge'
import { Sparkline } from './Sparkline'

// The pioneer profile label for an activity. Shared so the detail section and the publisher view
// surface the same wording — and the same wording the edit page uses. An auxiliary carries two
// shapes under one roster type: an ongoing (permanent) auxiliary reads "sans interruption", a
// single-month (monthly) one reads plain "Pionnier auxiliaire".
export function pioneerProfileLabel(activity: PioneerActivity): string {
  if (activity.kind === 'auxiliary') {
    return activity.row.permanent
      ? m.publishers_enrolment_standing_permanent_auxiliary()
      : m.publishers_form_profile_auxiliary_pioneer()
  }
  switch (activity.row.type) {
    case PublisherType.PionnierPermanant:
      return m.publishers_form_profile_permanent_pioneer()
    case PublisherType.PionnierSpecial:
      return m.publishers_form_profile_special_pioneer()
    case PublisherType.Missionnaire:
      return m.publishers_form_profile_missionary()
    default:
      return m.publishers_enrolment_profile_none()
  }
}

interface Props {
  serviceYear: number
  activity: PioneerActivity
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-1 p-4 text-center">
        <span className="font-black text-4xl tracking-tight tabular-nums">{value}</span>
        <span className="text-muted-foreground text-xs">{label}</span>
      </CardContent>
    </Card>
  )
}

export function PioneerActivitySection({ serviceYear, activity }: Props) {
  return (
    <Card id="activity">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{m.pioneers_detail_title()}</CardTitle>
            <Badge variant="secondary">{pioneerProfileLabel(activity)}</Badge>
          </div>
          {activity.row.groupName && <Badge variant="outline">{formatGroupName(activity.row.groupName)}</Badge>}
        </div>
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

function StudiesRow({ monthlyStudies, muted = false }: { monthlyStudies: (number | null)[]; muted?: boolean }) {
  const total = monthlyStudies.reduce<number>((sum, s) => sum + (s ?? 0), 0)
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div>
        <div className="font-medium text-sm">{m.pioneers_studies_label()}</div>
        <div className="text-muted-foreground text-xs tabular-nums">{total}</div>
      </div>
      <Sparkline values={monthlyStudies} muted={muted} />
    </div>
  )
}

function AnnualDetail({ serviceYear, row }: { serviceYear: number; row: PioneerAnnualRow }) {
  const { pace } = row

  // No enrolled span yet, or enrolled but not one report filed: there is no data to compute a rhythm
  // from, so show the empty state rather than a fabricated full-year deficit (a red "X h de retard",
  // a "600 h Requis par mois", and an "out of reach" warning all derived from zero actuals).
  if (pace.elapsedEnrolled === 0 || pace.reportedMonths === 0) {
    return <p className="text-muted-foreground text-sm">{m.pioneers_insufficient_data()}</p>
  }

  // A concluded pioneer stopped mid-year: show their final cumulative hours against the goal
  // adjusted to the months they served — never a full-year deficit, projection, or catch-up.
  if (row.concluded) {
    return (
      <>
        <Badge variant="outline">{m.pioneers_concluded()}</Badge>
        <PioneerPaceChart serviceYear={serviceYear} monthlyHours={pace.monthlyHours} rate={row.monthlyRate} />
        <div className="grid grid-cols-2 gap-4">
          <Stat value={`${pace.actualToDate} h`} label={m.pioneers_ytd_label()} />
          <Stat value={`${pace.fullYearTarget} h`} label={m.pioneers_concluded_goal_label()} />
        </div>
        <StudiesRow monthlyStudies={pace.monthlyStudies} muted />
      </>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <PioneerRiskBadge bucket={pace.riskBucket} label={paceLabel(pace)} />
        <ReportingChip status={pace.reportingStatus} />
      </div>
      <PioneerPaceChart serviceYear={serviceYear} monthlyHours={pace.monthlyHours} rate={row.monthlyRate} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat value={`${pace.actualToDate} h`} label={m.pioneers_ytd_label()} />
        <Stat value={`${pace.fullYearTarget} h`} label={m.pioneers_target_label()} />
        <Stat value={`${Math.round(pace.requiredAvgToFinish)} h`} label={m.pioneers_needs_per_month_label()} />
        <Stat value={`${Math.round(pace.recentAvg)} h`} label={m.pioneers_recent_avg_label()} />
      </div>
      <StudiesRow monthlyStudies={pace.monthlyStudies} />
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
  const pending = row.auxiliary.thisMonth != null && !row.auxiliary.thisMonth.reported
  return (
    <div className="flex flex-col gap-4">
      {pending && (
        <Badge variant="outline" className="self-start">
          {m.pioneers_aux_report_pending()}
        </Badge>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Stat
          value={pending || row.auxiliary.thisMonth == null ? '—' : `${row.auxiliary.thisMonth.hours} h`}
          label={m.pioneers_aux_standard_target({ rate: String(row.monthlyRate) })}
        />
        <Stat
          value={`${row.auxiliary.metMonths}/${row.auxiliary.enrolledMonths}`}
          label={m.pioneers_aux_months_label()}
        />
      </div>
    </div>
  )
}
