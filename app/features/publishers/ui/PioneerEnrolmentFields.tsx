import { useState } from 'react'
import { Form } from 'react-router'
import { coversMonth } from '~/features/publishers/model/pioneer-enrolment'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

const MONTH_LABELS = [
  m.activity_month_january,
  m.activity_month_february,
  m.activity_month_march,
  m.activity_month_april,
  m.activity_month_may,
  m.activity_month_june,
  m.activity_month_july,
  m.activity_month_august,
  m.activity_month_september,
  m.activity_month_october,
  m.activity_month_november,
  m.activity_month_december,
]

// One appointment "mode" per dropdown option. Monthly auxiliary is a single-month enrolment; the
// rest are ongoing standing appointments. Both auxiliary modes carry the same PublisherType and
// differ only in shape (single-month vs ongoing).
type Mode = 'monthly-aux' | 'permanent-aux' | 'permanent' | 'special' | 'missionary'

const STANDING_TYPE: Record<Exclude<Mode, 'monthly-aux'>, PublisherType> = {
  'permanent-aux': PublisherType.PionnierAuxiliaires,
  permanent: PublisherType.PionnierPermanant,
  special: PublisherType.PionnierSpecial,
  missionary: PublisherType.Missionnaire,
}

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
  currentType: PublisherType
  activeStanding: StandingEnrolment | null
  enrolments: EnrolmentRow[]
  monthOptions: { month: number; year: number }[]
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

// The pioneer-service section of the publisher edit page. The current profile is read-only (kept in
// sync by the enrolment workflow); a manager appoints through a single type dropdown that reveals
// the right fields — a monthly auxiliary needs a month + goal, every other (standing) type needs a
// start. One form, posting the matching enrolment intent to the edit-publisher route.
export default function PioneerEnrolmentFields({
  currentType,
  activeStanding,
  enrolments,
  monthOptions,
  yearOptions,
  hidePermanentAuxiliary,
}: PioneerEnrolmentFieldsProps) {
  const now = monthOptions[0] ?? { month: 0, year: yearOptions[0] }
  const [mode, setMode] = useState<Mode>('permanent')
  const [startMonth, setStartMonth] = useState(String(now.month))
  const [startYear, setStartYear] = useState(String(now.year))
  const [endMonth, setEndMonth] = useState(String(now.month))
  const [endYear, setEndYear] = useState(String(now.year))
  const [monthIndex, setMonthIndex] = useState('0')
  const [goal, setGoal] = useState('30')

  const selectedMonth = monthOptions[Number(monthIndex)] ?? now
  const isMonthly = mode === 'monthly-aux'

  // The enrolment covering the current month (a standing appointment or a monthly auxiliary) — the
  // member's real current status. Drives the read-only profile and prevents a second enrolment while
  // already enrolled this month.
  const currentEnrolment = enrolments.find(e => coversMonth(e, now.month, now.year)) ?? null
  const currentProfile = currentEnrolment != null ? enrolmentTypeLabel(currentEnrolment) : profileLabel(currentType)

  // Everything except the current active enrolment (shown on its own), most recent first.
  const history = enrolments
    .filter(e => e.id !== activeStanding?.id && e.id !== currentEnrolment?.id)
    .sort((a, b) => b.startYear * 12 + b.startMonth - (a.startYear * 12 + a.startMonth))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.publishers_enrolment_section_title()}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Current profile — read-only, derived from the enrolment covering the current month. */}
        <div className="space-y-1">
          <Label>{m.publishers_enrolment_current_profile_label()}</Label>
          <p className="font-medium text-sm">{currentProfile}</p>
        </div>

        {activeStanding != null ? (
          // A standing appointment is active — the only action is to close it.
          <Form method="post" className="flex flex-col gap-3 border-t pt-4">
            <input type="hidden" name="intent" value="close-standing" />
            <input type="hidden" name="enrolmentId" value={activeStanding.id} />
            <p className="text-sm">
              {m.publishers_enrolment_standing_active_label()} — <strong>{profileLabel(activeStanding.type)}</strong> (
              {MONTH_LABELS[activeStanding.startMonth]()} {activeStanding.startYear})
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
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
        ) : currentEnrolment != null ? (
          // Already enrolled for the current month (a monthly auxiliary) — show it with a way to undo,
          // rather than inviting a duplicate enrolment.
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <div>
              <p className="text-muted-foreground text-sm">{m.publishers_enrolment_already_enrolled()}</p>
              <p className="text-sm">
                <span className="font-medium">{enrolmentTypeLabel(currentEnrolment)}</span> ·{' '}
                {periodLabel(currentEnrolment)}
                {currentEnrolment.monthlyGoal != null &&
                  ` · ${m.publishers_enrolment_goal_suffix({ goal: String(currentEnrolment.monthlyGoal) })}`}
              </p>
            </div>
            <Form method="post">
              <input type="hidden" name="intent" value="remove-enrolment" />
              <input type="hidden" name="enrolmentId" value={currentEnrolment.id} />
              <Button type="submit" variant="secondary">
                {m.publishers_enrolment_remove()}
              </Button>
            </Form>
          </div>
        ) : (
          // No active appointment — one form whose fields follow the chosen type.
          <Form method="post" className="flex flex-col gap-3 border-t pt-4">
            <input type="hidden" name="intent" value={isMonthly ? 'enrol-monthly' : 'enrol-standing'} />
            {!isMonthly && <input type="hidden" name="type" value={STANDING_TYPE[mode]} />}
            {isMonthly && (
              <>
                <input type="hidden" name="month" value={selectedMonth.month} />
                <input type="hidden" name="year" value={selectedMonth.year} />
              </>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="enrolment-type">{m.publishers_enrolment_standing_type_label()}</Label>
                <Select value={mode} onValueChange={value => setMode(value as Mode)}>
                  <SelectTrigger id="enrolment-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly-aux">{m.publishers_enrolment_monthly_title()}</SelectItem>
                    {!hidePermanentAuxiliary && (
                      <SelectItem value="permanent-aux">
                        {m.publishers_enrolment_standing_permanent_auxiliary()}
                      </SelectItem>
                    )}
                    <SelectItem value="permanent">{m.publishers_form_profile_permanent_pioneer()}</SelectItem>
                    <SelectItem value="special">{m.publishers_form_profile_special_pioneer()}</SelectItem>
                    <SelectItem value="missionary">{m.publishers_form_profile_missionary()}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isMonthly ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="monthly-month">{m.publishers_enrolment_monthly_month_label()}</Label>
                    <Select value={monthIndex} onValueChange={setMonthIndex}>
                      <SelectTrigger id="monthly-month" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monthOptions.map((option, i) => (
                          <SelectItem key={`${option.month}-${option.year}`} value={String(i)}>
                            {MONTH_LABELS[option.month]()} {option.year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthly-goal">{m.publishers_enrolment_monthly_goal_label()}</Label>
                    <input type="hidden" name="monthlyGoal" value={goal} />
                    <Select value={goal} onValueChange={setGoal}>
                      <SelectTrigger id="monthly-goal" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">{m.publishers_enrolment_monthly_goal_15()}</SelectItem>
                        <SelectItem value="30">{m.publishers_enrolment_monthly_goal_30()}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="standing-month">{m.publishers_enrolment_standing_start_label()}</Label>
                    <input type="hidden" name="startMonth" value={startMonth} />
                    <Select value={startMonth} onValueChange={setStartMonth}>
                      <SelectTrigger id="standing-month" className="w-full">
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
                    <Label htmlFor="standing-year">&nbsp;</Label>
                    <input type="hidden" name="startYear" value={startYear} />
                    <Select value={startYear} onValueChange={setStartYear}>
                      <SelectTrigger id="standing-year" className="w-full">
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
                </>
              )}
            </div>

            <Button type="submit" className="self-start">
              {isMonthly ? m.publishers_enrolment_monthly_submit() : m.publishers_enrolment_standing_submit()}
            </Button>
          </Form>
        )}

        {/* Recorded appointments — confirms saved enrolments (esp. monthly auxiliary with its goal). */}
        {history.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <h3 className="font-semibold text-sm">{m.publishers_enrolment_history_title()}</h3>
            <ul className="space-y-1 text-sm">
              {history.map(e => (
                <li key={e.id} className="text-muted-foreground">
                  <span className="text-foreground">{enrolmentTypeLabel(e)}</span> · {periodLabel(e)}
                  {e.monthlyGoal != null && (
                    <> · {m.publishers_enrolment_goal_suffix({ goal: String(e.monthlyGoal) })}</>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
