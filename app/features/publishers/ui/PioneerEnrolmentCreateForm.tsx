import { useState } from 'react'
import { Form } from 'react-router'
import { auxiliaryGoalOptions, REDUCED_AUXILIARY_GOAL } from '~/features/publishers/model/pioneer-enrolment-form'
import type { EnrolmentMonthOption } from '~/features/publishers/model/pioneer-enrolment-form.type'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { MONTH_LABELS } from './month-labels'

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

interface PioneerEnrolmentCreateFormProps {
  monthOptions: EnrolmentMonthOption[]
  yearOptions: number[]
  // When true the setting is off → the permanent-auxiliary option is hidden (monthly aux stays).
  hidePermanentAuxiliary: boolean
}

// The create half of the pioneer-service section: a single type dropdown that reveals the right
// fields — a monthly auxiliary needs a month + goal, every other (standing) type needs a start.
// Posts its enrolment intent to the edit-publisher route.
export default function PioneerEnrolmentCreateForm({
  monthOptions,
  yearOptions,
  hidePermanentAuxiliary,
}: PioneerEnrolmentCreateFormProps) {
  const now = monthOptions[0] ?? { month: 0, year: yearOptions[0], auxiliaryGoal: REDUCED_AUXILIARY_GOAL }
  const [mode, setMode] = useState<Mode>('monthly-aux')
  const [startMonth, setStartMonth] = useState(String(now.month))
  const [startYear, setStartYear] = useState(String(now.year))
  const [monthIndex, setMonthIndex] = useState('0')
  const [goal, setGoal] = useState<string | null>(null)

  const selectedMonth = monthOptions[Number(monthIndex)] ?? now
  const isMonthly = mode === 'monthly-aux'

  // Seeded from the congregation's configured auxiliary rate for the selected month, then frozen
  // onto the enrolment on submit. `goal` stays null until the manager picks something, so switching
  // month re-seeds from that month's rate; an explicit pick the new month still offers is kept, one
  // it doesn't (the two months can resolve to different rates) falls back to the new standard.
  const goalOptions = auxiliaryGoalOptions(selectedMonth.auxiliaryGoal)
  const selectedGoal =
    goal != null && goalOptions.includes(Number(goal)) ? goal : String(goalOptions[0] ?? REDUCED_AUXILIARY_GOAL)

  return (
    <Form method="post" className="flex flex-col gap-3">
      <input type="hidden" name="intent" value={isMonthly ? 'enrol-monthly' : 'enrol-standing'} />
      <p className="text-muted-foreground text-sm">{m.publishers_enrolment_current_none()}</p>
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
                <SelectItem value="permanent-aux">{m.publishers_enrolment_standing_permanent_auxiliary()}</SelectItem>
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
              <Select key="monthly-month" value={monthIndex} onValueChange={setMonthIndex}>
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
              <input type="hidden" name="monthlyGoal" value={selectedGoal} />
              {/* Stable key so React never reconciles this Select into the standing-year Select
                  when `mode` flips — a reused Radix instance whose old value isn't among the new
                  items fires onValueChange('') and would silently clear the target state. */}
              <Select key="monthly-goal" value={selectedGoal} onValueChange={setGoal}>
                <SelectTrigger id="monthly-goal" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {goalOptions.map(hours => (
                    <SelectItem key={hours} value={String(hours)}>
                      {m.publishers_enrolment_monthly_goal_option({ hours: String(hours) })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="standing-month">{m.publishers_enrolment_standing_start_label()}</Label>
              <input type="hidden" name="startMonth" value={startMonth} />
              <Select key="standing-month" value={startMonth} onValueChange={setStartMonth}>
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
              <Select key="standing-year" value={startYear} onValueChange={setStartYear}>
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
  )
}
