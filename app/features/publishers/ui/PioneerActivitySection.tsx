import { MetricStrip, PeriodStepper, StatTile, Tag } from '@unitae/ui'
import { Link } from 'react-router'

import type { PioneerActivity, PioneerAnnualRow, PioneerAuxiliaryRow } from '~/features/publishers'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'

import { PaceMonthsChart, PaceTotalChart } from './PioneerPaceDetail'
import { PaceHeadline, PaceStudies } from './PioneerPacePanel'
import { hoursText } from './pioneer-pace-copy'

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

/** The publisher record's pioneer service: the year's pace, its figures and its charts, year by year. */
export function PioneerActivitySection({ serviceYear, activity }: Props) {
  return (
    <section
      id="activity"
      aria-labelledby="pioneer-service"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4.5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="pioneer-service" className="font-semibold text-lg">
          {m.pioneers_detail_title()}
        </h2>
        <Tag>{pioneerProfileLabel(activity)}</Tag>
        <span className="text-faint text-sm">{m.pioneers_goal_per_month({ goal: activity.row.monthlyRate })}</span>
        <PeriodStepper
          className="ml-auto"
          label={m.pioneers_service_year({ start: String(serviceYear), end: String(serviceYear + 1) })}
          previous={{ label: m.pioneers_previous_year(), href: `?sy=${serviceYear - 1}#activity` }}
          next={{ label: m.pioneers_next_year(), href: `?sy=${serviceYear + 1}#activity` }}
          renderLink={({ href, ...props }) => <Link to={href} preventScrollReset {...props} />}
          labelWidth={150}
        />
      </div>
      {activity.kind === 'annual' ? (
        <AnnualDetail serviceYear={serviceYear} row={activity.row} />
      ) : (
        <AuxiliaryDetail row={activity.row} />
      )}
    </section>
  )
}

function AnnualDetail({ serviceYear, row }: { serviceYear: number; row: PioneerAnnualRow }) {
  const { pace } = row
  return (
    <>
      <PaceHeadline row={row} serviceYear={serviceYear} />
      <MetricStrip aria-label={m.pioneers_detail_title()} minTileWidth={160}>
        <StatTile
          label={m.pioneers_fact_done()}
          value={hoursText(pace.achievedToDate)}
          foot={pace.creditToDate > 0 ? m.pioneers_credit_included({ hours: pace.creditToDate }) : undefined}
        />
        <StatTile
          label={row.concluded ? m.pioneers_fact_goal_adjusted() : m.pioneers_fact_goal_to_date()}
          value={hoursText(row.concluded ? pace.fullYearTarget : pace.targetToDate)}
          foot={row.concluded ? undefined : m.pioneers_fact_goal_year({ goal: hoursText(pace.fullYearTarget) })}
        />
        <StatTile
          label={m.pioneers_fact_needed()}
          value={row.concluded ? '—' : `≈ ${hoursText(pace.requiredAvgToFinish)}`}
          tone={pace.outOfReach ? 'warning' : 'neutral'}
          foot={pace.outOfReach ? m.pioneers_out_of_reach_short() : undefined}
        />
        <StatTile label={m.pioneers_fact_recent()} value={pace.reportedMonths > 0 ? hoursText(pace.recentAvg) : '—'} />
      </MetricStrip>
      <div className="grid gap-6 md:grid-cols-2">
        <PaceMonthsChart row={row} serviceYear={serviceYear} />
        <PaceTotalChart row={row} serviceYear={serviceYear} />
      </div>
      <PaceStudies row={row} serviceYear={serviceYear} />
    </>
  )
}

function AuxiliaryDetail({ row }: { row: PioneerAuxiliaryRow }) {
  const current = row.auxiliary.thisMonth
  return (
    <MetricStrip aria-label={m.pioneers_detail_title()} minTileWidth={160}>
      <StatTile
        label={m.pioneers_col_this_month()}
        value={current?.reported ? hoursText(current.hours + current.credit) : '—'}
        foot={current != null && !current.reported ? m.pioneers_aux_report_pending() : undefined}
      />
      <StatTile
        label={m.pioneers_col_goal_met()}
        value={row.auxiliary.metMonths}
        unit={m.pioneers_aux_met_unit({ total: row.auxiliary.reportedMonths })}
      />
      <StatTile
        label={m.pioneers_col_enrolment()}
        value={row.auxiliary.enrolledMonths}
        unit={m.pioneers_aux_months_unit()}
      />
    </MetricStrip>
  )
}
