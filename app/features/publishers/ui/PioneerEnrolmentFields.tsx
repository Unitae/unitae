import { useState } from 'react'
import { Form } from 'react-router'
import { coversMonth } from '~/features/publishers/model/pioneer-enrolment'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { EnrolmentGoalDialog } from './EnrolmentGoalDialog'
import { EnrolmentRemoveButton } from './EnrolmentRemoveButton'
import { MONTH_LABELS } from './month-labels'
import PioneerEnrolmentCreateForm, { type EnrolmentMonthOption } from './PioneerEnrolmentCreateForm'

function profileLabel(type: PublisherType): string {
  switch (type) {
    // In the enrolment context, a member whose type is auxiliary is a *permanent* auxiliary — a
    // monthly auxiliary never sets Member.type (§7.1) — so it reads "sans interruption".
    case PublisherType.PionnierAuxiliaires:
      return m.publishers_enrolment_standing_permanent_auxiliary()
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

interface StandingEnrolment {
  id: number
  type: PublisherType
  startMonth: number
  startYear: number
}

interface EnrolmentRow {
  id: number
  type: PublisherType
  startMonth: number
  startYear: number
  endMonth: number | null
  endYear: number | null
  monthlyGoal: number | null
}

interface PioneerEnrolmentFieldsProps {
  activeStanding: StandingEnrolment | null
  enrolments: EnrolmentRow[]
  monthOptions: EnrolmentMonthOption[]
  yearOptions: number[]
  // When true the setting is off → the permanent-auxiliary option is hidden (monthly aux stays).
  hidePermanentAuxiliary: boolean
}

function periodLabel(e: EnrolmentRow): string {
  const start = `${MONTH_LABELS[e.startMonth]()} ${e.startYear}`
  if (e.endMonth == null || e.endYear == null) return start
  if (e.endMonth === e.startMonth && e.endYear === e.startYear) {
    return m.publishers_enrolment_period_single({ month: start })
  }
  return m.publishers_enrolment_period_range({ from: start, to: `${MONTH_LABELS[e.endMonth]()} ${e.endYear}` })
}

// Auxiliary covers two shapes — a single-month stint is a *monthly* auxiliary, an ongoing one is
// *permanent* — so the history distinguishes them; every other type reads from profileLabel.
function enrolmentTypeLabel(e: EnrolmentRow): string {
  if (e.type === PublisherType.PionnierAuxiliaires) {
    const singleMonth = e.endMonth != null && e.endMonth === e.startMonth && e.endYear === e.startYear
    return singleMonth ? m.publishers_enrolment_monthly_title() : m.publishers_enrolment_standing_permanent_auxiliary()
  }
  return profileLabel(e.type)
}

// One-line identification of a stint ("Pionnier permanent · septembre 2025"), shown in the remove
// confirmation so the manager sees which of several stints they are about to erase.
function describeEnrolment(e: EnrolmentRow): string {
  return `${enrolmentTypeLabel(e)} · ${periodLabel(e)}`
}

// The pioneer-service section of the publisher edit page. It shows the member's current status once —
// an active standing appointment, a monthly enrolment for this month, or nothing — with the matching
// action (close, remove, or a create form). The create form is a single type dropdown that reveals
// the right fields: a monthly auxiliary needs a month + goal, every other (standing) type needs a
// start. Each form posts its enrolment intent to the edit-publisher route.
export default function PioneerEnrolmentFields({
  activeStanding,
  enrolments,
  monthOptions,
  yearOptions,
  hidePermanentAuxiliary,
}: PioneerEnrolmentFieldsProps) {
  const now = monthOptions[0] ?? { month: 0, year: yearOptions[0] }
  const [endMonth, setEndMonth] = useState(String(now.month))
  const [endYear, setEndYear] = useState(String(now.year))

  // The enrolment covering the current month (a standing appointment or a monthly auxiliary) — the
  // member's real current status. Prevents a second enrolment while already enrolled this month.
  const currentEnrolment = enrolments.find(e => coversMonth(e, now.month, now.year)) ?? null

  // Everything except the current active enrolment (shown on its own), most recent first.
  const history = enrolments
    .filter(e => e.id !== activeStanding?.id && e.id !== currentEnrolment?.id)
    .sort((a, b) => b.startYear * 12 + b.startMonth - (a.startYear * 12 + a.startMonth))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.publishers_enrolment_section_title()}</CardTitle>
        <p className="text-muted-foreground text-sm">{m.publishers_enrolment_section_description()}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {activeStanding != null ? (
          // A standing appointment is active — it *is* the current status. Two distinct actions: close
          // it (it really ended, keep the history) or remove it (it was recorded in error). The remove
          // control sits outside the close <Form> so it never submits it.
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">{profileLabel(activeStanding.type)}</p>
                <p className="text-muted-foreground text-sm">
                  {m.publishers_enrolment_active_since({
                    period: `${MONTH_LABELS[activeStanding.startMonth]()} ${activeStanding.startYear}`,
                  })}
                </p>
              </div>
              <EnrolmentRemoveButton
                enrolmentId={activeStanding.id}
                description={`${profileLabel(activeStanding.type)} · ${MONTH_LABELS[activeStanding.startMonth]()} ${activeStanding.startYear}`}
              />
            </div>
            <Form method="post" className="flex flex-col gap-3">
              <input type="hidden" name="intent" value="close-standing" />
              <input type="hidden" name="enrolmentId" value={activeStanding.id} />
              <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="close-month">{m.publishers_enrolment_standing_end_label()}</Label>
                  <input type="hidden" name="endMonth" value={endMonth} />
                  <Select value={endMonth} onValueChange={setEndMonth}>
                    <SelectTrigger id="close-month" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_LABELS.map((label, i) => (
                        <SelectItem key={label.toString()} value={String(i)}>
                          {label()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="close-year">&nbsp;</Label>
                  <input type="hidden" name="endYear" value={endYear} />
                  <Select value={endYear} onValueChange={setEndYear}>
                    <SelectTrigger id="close-year" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map(year => (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" variant="secondary" className="self-start">
                {m.publishers_enrolment_standing_end_submit()}
              </Button>
            </Form>
          </div>
        ) : currentEnrolment != null ? (
          // Enrolled for the current month (a monthly auxiliary) — it *is* the current status; offer undo
          // rather than inviting a duplicate enrolment.
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium">{enrolmentTypeLabel(currentEnrolment)}</p>
              <p className="text-muted-foreground text-sm">
                {m.publishers_enrolment_enrolled_for({ period: periodLabel(currentEnrolment) })}
                {currentEnrolment.monthlyGoal != null &&
                  ` · ${m.publishers_enrolment_goal_suffix({ goal: String(currentEnrolment.monthlyGoal) })}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {/* Offered whether or not a goal is stored: clearing one drops the stint back to the
                  configured rate, and gating on `monthlyGoal != null` would make that a one-way door. */}
              <EnrolmentGoalDialog
                enrolmentId={currentEnrolment.id}
                monthlyGoal={currentEnrolment.monthlyGoal}
                description={describeEnrolment(currentEnrolment)}
              />
              <EnrolmentRemoveButton
                enrolmentId={currentEnrolment.id}
                description={describeEnrolment(currentEnrolment)}
              />
            </div>
          </div>
        ) : (
          // No appointment covering this month — state that plainly, then the create form.
          <PioneerEnrolmentCreateForm
            monthOptions={monthOptions}
            yearOptions={yearOptions}
            hidePermanentAuxiliary={hidePermanentAuxiliary}
          />
        )}

        {/* Recorded appointments — confirms saved enrolments (esp. monthly auxiliary with its goal). */}
        {history.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <h3 className="font-semibold text-sm">{m.publishers_enrolment_history_title()}</h3>
            <ul className="text-sm">
              {history.map(e => (
                <li key={e.id} className="flex items-center justify-between gap-3 text-muted-foreground">
                  <span>
                    <span className="text-foreground">{enrolmentTypeLabel(e)}</span> · {periodLabel(e)}
                    {e.monthlyGoal != null && (
                      <> · {m.publishers_enrolment_goal_suffix({ goal: String(e.monthlyGoal) })}</>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {/* The create form only reaches the current and next month, so a past stint
                        cannot be deleted and re-made — its goal has to be correctable in place. */}
                    <EnrolmentGoalDialog
                      enrolmentId={e.id}
                      monthlyGoal={e.monthlyGoal}
                      description={describeEnrolment(e)}
                    />
                    {/* A past stint can only be erased, never closed — it is already bounded. */}
                    <EnrolmentRemoveButton enrolmentId={e.id} description={describeEnrolment(e)} compact />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
