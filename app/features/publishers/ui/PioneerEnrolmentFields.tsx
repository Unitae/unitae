import { useState } from 'react'
import { Form } from 'react-router'
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

function profileLabel(type: PublisherType): string {
  switch (type) {
    case PublisherType.PionnierAuxiliaires:
      return m.publishers_form_profile_auxiliary_pioneer()
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

interface PioneerEnrolmentFieldsProps {
  currentType: PublisherType
  activeStanding: StandingEnrolment | null
  monthOptions: { month: number; year: number }[]
  yearOptions: number[]
  // When true the setting is off → the permanent-auxiliary standing option is hidden (monthly stays).
  hidePermanentAuxiliary: boolean
}

// The pioneer-service section of the publisher edit page. Replaces the old raw type dropdown: the
// current profile is read-only (kept in sync by the enrolment workflow), and a manager appoints via
// two explicit forms — a standing appointment (ongoing stint) and a monthly auxiliary enrolment.
// Each form posts back to the edit-publisher route with a hidden `intent`.
export default function PioneerEnrolmentFields({
  currentType,
  activeStanding,
  monthOptions,
  yearOptions,
  hidePermanentAuxiliary,
}: PioneerEnrolmentFieldsProps) {
  const now = monthOptions[0] ?? { month: 0, year: yearOptions[0] }
  const [standingType, setStandingType] = useState<PublisherType>(PublisherType.PionnierPermanant)
  const [startMonth, setStartMonth] = useState(String(now.month))
  const [startYear, setStartYear] = useState(String(now.year))
  const [endMonth, setEndMonth] = useState(String(now.month))
  const [endYear, setEndYear] = useState(String(now.year))
  const [monthIndex, setMonthIndex] = useState('0')
  const [goal, setGoal] = useState('30')

  const selectedMonth = monthOptions[Number(monthIndex)] ?? now

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.publishers_enrolment_section_title()}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Current profile — read-only, derived from the active appointment. */}
        <div className="space-y-1">
          <Label>{m.publishers_enrolment_current_profile_label()}</Label>
          <p className="font-medium text-sm">{profileLabel(currentType)}</p>
        </div>

        {/* Standing appointment: an ongoing stint (permanent / special / missionary / permanent aux). */}
        <div className="space-y-2 border-t pt-4">
          <div>
            <h3 className="font-semibold text-sm">{m.publishers_enrolment_standing_title()}</h3>
            <p className="text-muted-foreground text-xs">{m.publishers_enrolment_standing_description()}</p>
          </div>

          {activeStanding != null ? (
            <Form method="post" className="flex flex-col gap-3">
              <input type="hidden" name="intent" value="close-standing" />
              <input type="hidden" name="enrolmentId" value={activeStanding.id} />
              <p className="text-sm">
                {m.publishers_enrolment_standing_active_label()} — <strong>{profileLabel(activeStanding.type)}</strong>{' '}
                ({MONTH_LABELS[activeStanding.startMonth]()} {activeStanding.startYear})
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
          ) : (
            <Form method="post" className="flex flex-col gap-3">
              <input type="hidden" name="intent" value="enrol-standing" />
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="standing-type">{m.publishers_enrolment_standing_type_label()}</Label>
                  <input type="hidden" name="type" value={standingType} />
                  <Select value={standingType} onValueChange={v => setStandingType(v as PublisherType)}>
                    <SelectTrigger id="standing-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PublisherType.PionnierPermanant}>
                        {m.publishers_form_profile_permanent_pioneer()}
                      </SelectItem>
                      <SelectItem value={PublisherType.PionnierSpecial}>
                        {m.publishers_form_profile_special_pioneer()}
                      </SelectItem>
                      <SelectItem value={PublisherType.Missionnaire}>
                        {m.publishers_form_profile_missionary()}
                      </SelectItem>
                      {!hidePermanentAuxiliary && (
                        <SelectItem value={PublisherType.PionnierAuxiliaires}>
                          {m.publishers_enrolment_standing_permanent_auxiliary()}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
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
              </div>
              <Button type="submit" className="self-start">
                {m.publishers_enrolment_standing_submit()}
              </Button>
            </Form>
          )}
        </div>

        {/* Monthly auxiliary — always available, independent of the setting. */}
        <div className="space-y-2 border-t pt-4">
          <div>
            <h3 className="font-semibold text-sm">{m.publishers_enrolment_monthly_title()}</h3>
            <p className="text-muted-foreground text-xs">{m.publishers_enrolment_monthly_description()}</p>
          </div>
          <Form method="post" className="flex flex-col gap-3">
            <input type="hidden" name="intent" value="enrol-monthly" />
            <input type="hidden" name="month" value={selectedMonth.month} />
            <input type="hidden" name="year" value={selectedMonth.year} />
            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>
            <Button type="submit" className="self-start">
              {m.publishers_enrolment_monthly_submit()}
            </Button>
          </Form>
        </div>
      </CardContent>
    </Card>
  )
}
