import { getFormProps, type SubmissionResult, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { FormSection } from '@unitae/ui'
import { CalendarOff } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Form, Link } from 'react-router'

import { absenceDays, absenceLength, absenceWindow, formatAbsencePeriod } from '~/features/events/model/absence'
import { dayOffSchema } from '~/features/events/schemas/day-off.schema'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DateInput } from '~/shared/ui/DateInput'
import { FormSaveBar } from '~/shared/ui/FormSaveBar'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useFormChanges } from '~/shared/ui/hooks/use-form-changes'
import { Label } from '~/shared/ui/label'
import { SubmitButton } from '~/shared/ui/SubmitButton'

const DAY = /^\d{4}-\d{2}-\d{2}$/

interface AbsenceFormProps {
  /** Today in the congregation's zone: the earliest first day. */
  today: string
  timeZone: string
  lastResult: SubmissionResult<string[]> | null | undefined
  onDirtyChange?: (dirty: boolean) => void
}

/** The period of a new absence: its first and last days, both included, with what they add up to. */
export function AbsenceForm({ today, timeZone, lastResult, onDirtyChange }: AbsenceFormProps) {
  const { ref, changes } = useFormChanges()
  useEffect(() => onDirtyChange?.(changes > 0), [changes, onDirtyChange])
  useFocusError(lastResult)
  const [form, fields] = useForm({
    lastResult,
    onValidate: ({ formData }) => parseWithZod(formData, { schema: dayOffSchema }),
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
  })
  const [first, setFirst] = useState(String(fields.first.initialValue ?? ''))
  const [last, setLast] = useState(String(fields.last.initialValue ?? ''))
  const helpId = useId()

  const complete = DAY.test(first) && DAY.test(last) && last >= first
  const span = complete ? absenceWindow({ first, last }, timeZone) : null

  return (
    <Form method="post" {...getFormProps(form)} ref={ref} className="flex max-w-4xl flex-col pb-24">
      <FormSection title={m.days_off_form_period_title()} description={m.days_off_form_period_description()}>
        <div className="flex flex-col gap-2">
          <Label htmlFor={fields.first.id}>{m.days_off_form_first()}</Label>
          <DateInput
            id={fields.first.id}
            name={fields.first.name}
            min={today}
            value={first || null}
            required
            aria-invalid={fields.first.errors ? true : undefined}
            aria-describedby={fields.first.errors ? fields.first.errorId : undefined}
            onChange={next => {
              const value = next ?? ''
              setFirst(value)
              // One day unless said otherwise: the last day follows a first day moved past it.
              if (last === '' || last < value) setLast(value)
            }}
          />
          {fields.first.errors && (
            <p id={fields.first.errorId} className="text-destructive text-sm">
              {fields.first.errors[0]}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={fields.last.id}>{m.days_off_form_last()}</Label>
          <DateInput
            id={fields.last.id}
            name={fields.last.name}
            min={first || today}
            value={last || null}
            required
            aria-invalid={fields.last.errors ? true : undefined}
            aria-describedby={fields.last.errors ? `${helpId} ${fields.last.errorId}` : helpId}
            onChange={next => setLast(next ?? '')}
          />
          <p id={helpId} className="text-faint text-xs">
            {m.days_off_form_last_help()}
          </p>
          {fields.last.errors && (
            <p id={fields.last.errorId} className="text-destructive text-sm">
              {fields.last.errors[0]}
            </p>
          )}
        </div>
        {span != null && (
          <p
            aria-live="polite"
            className="col-span-full flex items-center gap-2.5 rounded-md bg-sidebar px-3 py-2.5 text-sm"
          >
            <CalendarOff aria-hidden="true" className="size-4 shrink-0 text-faint" />
            <span>
              <span className="font-medium">{formatAbsencePeriod(span.startDate, span.endDate, timeZone)}</span>
              {' · '}
              <span className="tabular-nums">
                {absenceLength(absenceDays(span.startDate, span.endDate, timeZone).count)}
              </span>
            </span>
          </p>
        )}
        {form.errors && <p className="col-span-full text-destructive text-sm">{form.errors[0]}</p>}
      </FormSection>

      <FormSaveBar changes={null}>
        <Button variant="ghost" asChild>
          <Link to="/me/days-off">{m.common_cancel()}</Link>
        </Button>
        <SubmitButton>{m.days_off_form_submit()}</SubmitButton>
      </FormSaveBar>
    </Form>
  )
}
