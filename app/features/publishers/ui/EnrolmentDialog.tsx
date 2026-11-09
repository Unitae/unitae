import { SegmentedControl } from '@unitae/ui'
import { useState } from 'react'
import { useFetcher } from 'react-router'

import {
  auxiliaryGoalOptions,
  ENROLMENT_MODES,
  type EnrolmentMode,
} from '~/features/publishers/model/pioneer-enrolment-form'
import type { EnrolmentOptions, RecordEnrolment } from '~/features/publishers/model/publisher-record.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/shared/ui/dialog'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { cn } from '~/shared/utils/utils'
import { formErrorsOf } from './enrolment-form-errors'
import { monthLabel, serviceLabel, shortMonthLabel } from './enrolment-labels'
import { type MonthRef, MonthYearField } from './MonthYearField'
import { ConfirmDialog } from './RecordDialogs'

interface EnrolmentDialogProps {
  open: boolean
  onClose: () => void
  publisherId: number
  name: string
  options: EnrolmentOptions
  /** The stint to correct; without one, the dialog enrols. */
  enrolment?: RecordEnrolment
}

/**
 * Enrol the person as a pioneer, or correct one of their enrolments with the same fields: the service, its months and
 * its goal. Saved at once, apart from the rest of the record; a refused change stays in the dialog with its reason.
 */
export function EnrolmentDialog(props: EnrolmentDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={next => !next && props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        {/* Remounted on every opening, so a cancelled edit never lingers into the next one. */}
        {props.open && <EnrolmentForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function EnrolmentForm({ onClose, publisherId, name, options, enrolment }: EnrolmentDialogProps) {
  const fetcher = useFetcher()
  useCloseOnSave(fetcher, onClose)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const firstMonth = options.months[0] ?? { month: 0, year: options.years[0] ?? 2026, auxiliaryGoal: 15 }

  const [mode, setMode] = useState<EnrolmentMode>(enrolment?.mode ?? 'monthly-aux')
  const [start, setStart] = useState<MonthRef>(
    enrolment ? { month: enrolment.startMonth, year: enrolment.startYear } : firstMonth,
  )
  const [end, setEnd] = useState<MonthRef | null>(
    enrolment?.endMonth != null && enrolment.endYear != null
      ? { month: enrolment.endMonth, year: enrolment.endYear }
      : null,
  )
  const [goal, setGoal] = useState(enrolment?.monthlyGoal != null ? String(enrolment.monthlyGoal) : '')

  const monthly = mode === 'monthly-aux'
  const creating = enrolment == null
  const offered = options.months.find(option => option.month === start.month && option.year === start.year)
  const goalChoices = auxiliaryGoalOptions(offered?.auxiliaryGoal ?? firstMonth.auxiliaryGoal)
  const goalValue = creating && monthly ? (goalChoices.includes(Number(goal)) ? goal : String(goalChoices[0])) : goal
  const modes = ENROLMENT_MODES.filter(
    choice => choice !== 'permanent-aux' || !options.hidePermanentAuxiliary || enrolment?.mode === 'permanent-aux',
  )
  const errors = formErrorsOf(fetcher.data)
  const busy = fetcher.state !== 'idle'

  return (
    <fetcher.Form method="post" action={`/publishers/${publisherId}/enrolments`} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{creating ? m.publishers_record_enrol_title() : m.publishers_record_correct_title()}</DialogTitle>
        <DialogDescription>
          {creating
            ? m.publishers_record_enrol_description({ name })
            : m.publishers_record_correct_description({ name })}
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="intent" value={creating ? 'create' : 'correct'} />
      {enrolment && <input type="hidden" name="enrolmentId" value={enrolment.id} />}
      <input type="hidden" name="mode" value={mode} />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-2 font-medium text-sm">{m.publishers_record_enrol_service()}</legend>
        {modes.map(choice => (
          <label
            key={choice}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm transition-colors duration-(--u-duration-fast)',
              mode === choice ? 'border-brand bg-brand-soft' : 'hover:bg-hover',
            )}
          >
            <input
              type="radio"
              name="service-choice"
              className="accent-(--u-accent)"
              checked={mode === choice}
              onChange={() => setMode(choice)}
            />
            <span className="font-medium">{serviceLabel(choice)}</span>
          </label>
        ))}
      </fieldset>

      {creating && monthly ? (
        <MonthlyChoice
          options={options}
          start={start}
          onStart={setStart}
          goalChoices={goalChoices}
          goal={goalValue}
          onGoal={setGoal}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <MonthYearField
            id="enrol-start"
            label={monthly ? m.publishers_record_enrol_month() : m.publishers_record_enrol_first_month()}
            names={{ month: 'startMonth', year: 'startYear' }}
            value={start}
            onChange={value => value && setStart(value)}
            years={options.years}
          />
          {!creating && !monthly && (
            <MonthYearField
              id="enrol-end"
              label={m.publishers_record_enrol_last_month()}
              names={{ month: 'endMonth', year: 'endYear' }}
              value={end}
              onChange={setEnd}
              years={options.years}
              ongoing
            />
          )}
        </div>
      )}

      {!creating && (
        <div className="flex max-w-56 flex-col gap-2">
          <Label htmlFor="enrol-goal">{m.publishers_record_enrol_goal()}</Label>
          <Input
            id="enrol-goal"
            name="monthlyGoal"
            type="number"
            inputMode="numeric"
            min={1}
            value={goal}
            placeholder={m.publishers_record_enrol_goal_placeholder({ goal: options.rates[mode] })}
            onChange={event => setGoal(event.target.value)}
            aria-describedby="enrol-goal-help"
          />
          <p id="enrol-goal-help" className="text-faint text-xs">
            {m.publishers_record_enrol_goal_help()}
          </p>
        </div>
      )}

      {errors.length > 0 && (
        <p role="alert" className="text-destructive text-sm">
          {errors.join(' ')}
        </p>
      )}

      <DialogFooter className={cn(!creating && 'sm:justify-between')}>
        {!creating && (
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
            {m.publishers_record_enrol_delete()}
          </Button>
        )}
        <span className="flex gap-2 max-sm:flex-col-reverse">
          <Button type="button" variant="ghost" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button type="submit" disabled={busy}>
            {creating
              ? monthly
                ? m.publishers_record_enrol_submit_month({ month: monthLabel(start.month, start.year) })
                : m.publishers_record_enrol_submit()
              : m.common_save()}
          </Button>
        </span>
      </DialogFooter>

      {enrolment && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={m.publishers_enrolment_remove_confirm_title()}
          description={m.publishers_enrolment_remove_confirm_description()}
          confirm={m.publishers_enrolment_remove()}
          destructive
          onConfirm={() => {
            setConfirmDelete(false)
            fetcher.submit(
              { intent: 'remove', enrolmentId: String(enrolment.id) },
              { method: 'post', action: `/publishers/${publisherId}/enrolments` },
            )
          }}
        />
      )}
    </fetcher.Form>
  )
}

interface MonthlyChoiceProps {
  options: EnrolmentOptions
  start: MonthRef
  onStart: (value: MonthRef) => void
  goalChoices: number[]
  goal: string
  onGoal: (value: string) => void
}

/** A one-month auxiliary: this month or the next, at the congregation's rate or the reduced one. */
function MonthlyChoice({ options, start, onStart, goalChoices, goal, onGoal }: MonthlyChoiceProps) {
  const key = (ref: MonthRef) => `${ref.year}-${ref.month}`
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="startMonth" value={start.month} />
      <input type="hidden" name="startYear" value={start.year} />
      <input type="hidden" name="monthlyGoal" value={goal} />
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{m.publishers_record_enrol_month()}</span>
        <SegmentedControl
          aria-label={m.publishers_record_enrol_month()}
          options={options.months.map(option => ({
            value: key(option),
            label: shortMonthLabel(option.month, option.year),
          }))}
          value={key(start)}
          onValueChange={value => {
            const option = options.months.find(candidate => key(candidate) === value)
            if (option) onStart({ month: option.month, year: option.year })
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{m.publishers_record_enrol_goal_short()}</span>
        <SegmentedControl
          aria-label={m.publishers_record_enrol_goal_short()}
          options={goalChoices.map(hours => ({
            value: String(hours),
            label: m.publishers_record_hours({ count: hours }),
          }))}
          value={goal}
          onValueChange={onGoal}
        />
      </div>
    </div>
  )
}
