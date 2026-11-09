import { SegmentedControl, SidePanel } from '@unitae/ui'
import { type ReactNode, type Ref, useState } from 'react'
import { useFetcher } from 'react-router'

import {
  auxiliaryGoalOptions,
  ENROLMENT_MODES,
  type EnrolmentMode,
} from '~/features/publishers/model/pioneer-enrolment-form'
import type { EnrolmentOptions, RecordEnrolment } from '~/features/publishers/model/publisher-record.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { cn } from '~/shared/utils/utils'

import { formErrorsOf } from './enrolment-form-errors'
import { monthLabel, serviceLabel, shortMonthLabel } from './enrolment-labels'
import { type MonthRef, MonthYearField } from './MonthYearField'
import { ConfirmDialog } from './RecordDialogs'

const FORM_ID = 'enrolment-form'

interface EnrolmentPanelProps {
  publisherId: number
  name: string
  options: EnrolmentOptions
  /** The stint to correct; without one, the panel enrols. */
  enrolment?: RecordEnrolment
  /** Docked beside the record from 1280 px; a sheet over it below. */
  docked: boolean
  /** The button that opened it: focus goes back there on close. */
  trigger: HTMLElement | null
  /** Counts the docked form's changes, so switching to another panel asks before dropping them. */
  formRef?: Ref<HTMLFormElement>
  /** × and Escape: the host asks first while the docked form holds changes. */
  onRequestClose: () => void
  /** Closes without asking: « Annuler », a save, a delete. */
  onClose: () => void
}

/**
 * Enrol the person as a pioneer, or correct one of their enrolments with the same fields: the service, its months and
 * its goal. Beside the record, so the pioneer section stays in view; saved at once, apart from the rest of the record,
 * and a refused change stays in the panel with its reason.
 */
export function EnrolmentPanel({
  publisherId,
  name,
  options,
  enrolment,
  docked,
  trigger,
  formRef,
  onRequestClose,
  onClose,
}: EnrolmentPanelProps) {
  const saver = useFetcher()
  const deleter = useFetcher()
  useCloseOnSave(saver, onClose)
  useCloseOnSave(deleter, onClose)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const form = useEnrolmentForm(options, enrolment)
  const creating = enrolment == null
  const action = `/publishers/${publisherId}/enrolments`
  const busy = saver.state !== 'idle' || deleter.state !== 'idle'

  const title = creating ? m.publishers_record_enrol_title() : m.publishers_record_correct_title()
  const description = creating
    ? m.publishers_record_enrol_description({ name })
    : m.publishers_record_correct_description({ name })
  const body = (
    <saver.Form id={FORM_ID} method="post" action={action} ref={formRef} className="flex flex-col gap-4">
      <EnrolmentFields form={form} options={options} enrolment={enrolment} />
      <Errors messages={[...formErrorsOf(saver.data), ...formErrorsOf(deleter.data)]} />
      {/* Deleting is apart from saving: for a stint recorded in error, after a confirmation. */}
      {!creating && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 self-start text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          {m.publishers_record_enrol_delete()}
        </Button>
      )}
    </saver.Form>
  )
  const footer = (
    <div className="flex w-full items-center justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onClose}>
        {m.common_cancel()}
      </Button>
      <Button type="submit" form={FORM_ID} disabled={busy}>
        {creating
          ? form.monthly
            ? m.publishers_record_enrol_submit_month({ month: monthLabel(form.start.month, form.start.year) })
            : m.publishers_record_enrol_submit()
          : m.common_save()}
      </Button>
    </div>
  )
  const confirm = enrolment && (
    <ConfirmDialog
      open={confirmDelete}
      onClose={() => setConfirmDelete(false)}
      title={m.publishers_enrolment_remove_confirm_title()}
      description={m.publishers_enrolment_remove_confirm_description()}
      confirm={m.publishers_enrolment_remove()}
      destructive
      onConfirm={() => {
        setConfirmDelete(false)
        deleter.submit({ intent: 'remove', enrolmentId: String(enrolment.id) }, { method: 'post', action })
      }}
    />
  )

  if (docked) {
    return (
      <SidePanel
        title={title}
        description={description}
        closeLabel={m.common_close()}
        onClose={onRequestClose}
        returnFocus={trigger}
        footer={footer}
      >
        {body}
        {confirm}
      </SidePanel>
    )
  }
  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{body}</div>
        <SheetFooter className="border-border border-t">{footer}</SheetFooter>
        {confirm}
      </SheetContent>
    </Sheet>
  )
}

/** The form's state: the service, its months and its goal, from the stint being corrected or a first offer. */
function useEnrolmentForm(options: EnrolmentOptions, enrolment?: RecordEnrolment) {
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
  const offered = options.months.find(option => option.month === start.month && option.year === start.year)
  const goalChoices = auxiliaryGoalOptions(offered?.auxiliaryGoal ?? firstMonth.auxiliaryGoal)
  return { mode, setMode, start, setStart, end, setEnd, goal, setGoal, goalChoices, monthly: mode === 'monthly-aux' }
}

type EnrolmentForm = ReturnType<typeof useEnrolmentForm>

interface EnrolmentFieldsProps {
  form: EnrolmentForm
  options: EnrolmentOptions
  enrolment?: RecordEnrolment
}

function EnrolmentFields({ form, options, enrolment }: EnrolmentFieldsProps) {
  const creating = enrolment == null
  const { mode, monthly } = form
  // A one-month auxiliary is enrolled at one of the goals offered for its month.
  const goal =
    creating && monthly
      ? form.goalChoices.includes(Number(form.goal))
        ? form.goal
        : String(form.goalChoices[0])
      : form.goal
  const modes = ENROLMENT_MODES.filter(
    choice => choice !== 'permanent-aux' || !options.hidePermanentAuxiliary || enrolment?.mode === 'permanent-aux',
  )

  return (
    <>
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
              onChange={() => form.setMode(choice)}
            />
            <span className="font-medium">{serviceLabel(choice)}</span>
          </label>
        ))}
      </fieldset>

      {creating && monthly ? (
        <MonthlyChoice options={options} form={form} goal={goal} />
      ) : (
        <div className="grid gap-3">
          <MonthYearField
            id="enrol-start"
            label={monthly ? m.publishers_record_enrol_month() : m.publishers_record_enrol_first_month()}
            names={{ month: 'startMonth', year: 'startYear' }}
            value={form.start}
            onChange={value => value && form.setStart(value)}
            years={options.years}
          />
          {!creating && !monthly && (
            <MonthYearField
              id="enrol-end"
              label={m.publishers_record_enrol_last_month()}
              names={{ month: 'endMonth', year: 'endYear' }}
              value={form.end}
              onChange={form.setEnd}
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
            value={form.goal}
            placeholder={m.publishers_record_enrol_goal_placeholder({ goal: options.rates[mode] })}
            onChange={event => form.setGoal(event.target.value)}
            aria-describedby="enrol-goal-help"
          />
          <p id="enrol-goal-help" className="text-faint text-xs">
            {m.publishers_record_enrol_goal_help()}
          </p>
        </div>
      )}
    </>
  )
}

/** A one-month auxiliary: this month or the next, at the congregation's rate or the reduced one. */
function MonthlyChoice({ options, form, goal }: { options: EnrolmentOptions; form: EnrolmentForm; goal: string }) {
  const key = (ref: MonthRef) => `${ref.year}-${ref.month}`
  return (
    <div className="grid gap-3">
      <input type="hidden" name="startMonth" value={form.start.month} />
      <input type="hidden" name="startYear" value={form.start.year} />
      <input type="hidden" name="monthlyGoal" value={goal} />
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{m.publishers_record_enrol_month()}</span>
        <SegmentedControl
          aria-label={m.publishers_record_enrol_month()}
          options={options.months.map(option => ({
            value: key(option),
            label: shortMonthLabel(option.month, option.year),
          }))}
          value={key(form.start)}
          onValueChange={value => {
            const option = options.months.find(candidate => key(candidate) === value)
            if (option) form.setStart({ month: option.month, year: option.year })
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm">{m.publishers_record_enrol_goal_short()}</span>
        <SegmentedControl
          aria-label={m.publishers_record_enrol_goal_short()}
          options={form.goalChoices.map(hours => ({
            value: String(hours),
            label: m.publishers_record_hours({ count: hours }),
          }))}
          value={goal}
          onValueChange={form.setGoal}
        />
      </div>
    </div>
  )
}

function Errors({ messages }: { messages: string[] }): ReactNode {
  if (messages.length === 0) return null
  return (
    <p role="alert" className="text-destructive text-sm">
      {messages.join(' ')}
    </p>
  )
}
