import { FormSection } from '@unitae/ui'
import { CalendarDays, Settings } from 'lucide-react'
import { Link } from 'react-router'

import type { CreationTemplate } from '~/features/events/model/programme-creation'
import { byWeek } from '~/features/events/model/programme-creation'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Checkbox } from '~/shared/ui/checkbox'
import { DateInput } from '~/shared/ui/DateInput'
import { Label } from '~/shared/ui/label'
import { cn } from '~/shared/utils/utils'
import { contentLabel, monthName, shortDate, templateLine, weeksLabel } from './creation-labels'
import type { ProgrammeCreationState } from './use-programme-creation'

interface SectionsProps {
  state: ProgrammeCreationState
  errors: Record<string, string[] | null | undefined>
  today: string
  canManage: boolean
}

/** « Plusieurs semaines »: the meetings to create, ticked, and the period they cover. */
export function CreationSeriesSections({ state, errors, today, canManage }: SectionsProps) {
  if (state.recurring.length === 0) return <NoMeetings canManage={canManage} />
  const weeks = byWeek(state.planned).length

  return (
    <>
      <FormSection title={m.programs_new_meetings_title()} description={m.programs_new_meetings_description()}>
        <div className="col-span-full flex flex-col gap-1.5">
          {state.recurring.map(template => (
            <TemplateCheckCard
              key={template.id}
              template={template}
              checked={state.selected.has(template.id)}
              onToggle={() => state.toggleTemplate(template.id)}
              today={today}
            />
          ))}
          <FieldError messages={errors.templateIds} />
        </div>
      </FormSection>

      <FormSection title={m.programs_new_period_title()} description={m.programs_new_period_description()}>
        <DayField
          id="creation-from"
          name="from"
          label={m.programs_new_from_label()}
          value={state.from}
          onChange={state.setFrom}
          min={today}
          errors={errors.from}
        />
        <DayField
          id="creation-to"
          name="to"
          label={m.programs_new_to_label()}
          value={state.to}
          onChange={state.setTo}
          min={state.from || today}
          errors={errors.to}
        />
        {state.ends.length > 0 && (
          <fieldset className="col-span-full flex flex-wrap items-center gap-1.5">
            <legend className="sr-only">{m.programs_new_until_label()}</legend>
            <span aria-hidden="true" className="mr-1 text-faint text-sm">
              {m.programs_new_until_label()}
            </span>
            {state.ends.map(end => (
              <Button
                key={end}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={state.to === end}
                onClick={() => state.setTo(end)}
                className="aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-brand-text"
              >
                {m.programs_new_until_month({ month: monthName(end) })}
              </Button>
            ))}
          </fieldset>
        )}
        {weeks > 0 && (
          <p className="col-span-full text-faint text-sm tabular-nums">
            {weeksLabel(weeks)}
            {state.follows != null && ` · ${m.programs_new_follows_last({ date: shortDate(state.follows) })}`}
          </p>
        )}
      </FormSection>
    </>
  )
}

function TemplateCheckCard({
  template,
  checked,
  onToggle,
  today,
}: {
  template: CreationTemplate
  checked: boolean
  onToggle: () => void
  today: string
}) {
  const id = `creation-template-${template.id}`
  const last =
    template.lastDay != null && template.lastDay >= today
      ? m.programs_new_created_until({ date: shortDate(template.lastDay) })
      : m.programs_new_none_to_come()
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors duration-(--u-duration-fast)',
        checked ? 'border-brand bg-brand-soft' : 'border-border hover:bg-hover',
      )}
    >
      <Checkbox
        id={id}
        name="templateIds"
        value={String(template.id)}
        checked={checked}
        onCheckedChange={onToggle}
        className="mt-0.5"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 font-medium text-sm">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: template.color }}
          />
          {template.name}
        </span>
        <span className="text-muted-foreground text-sm tabular-nums">{templateLine(template)}</span>
        <span className="text-faint text-sm tabular-nums">{contentLabel(template)}</span>
        <span className="text-faint text-sm tabular-nums sm:hidden">{last}</span>
      </span>
      <span className="shrink-0 text-faint text-sm tabular-nums max-sm:hidden">{last}</span>
    </label>
  )
}

export function DayField({
  id,
  name,
  label,
  value,
  onChange,
  min,
  errors,
}: {
  id: string
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  min: string
  errors: string[] | null | undefined
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <DateInput
        id={id}
        name={name}
        value={value || null}
        min={min}
        onChange={next => onChange(next ?? '')}
        aria-invalid={errors != null && errors.length > 0}
        aria-describedby={errors?.length ? `${id}-error` : undefined}
      />
      <FieldError id={`${id}-error`} messages={errors} />
    </div>
  )
}

export function FieldError({ id, messages }: { id?: string; messages: string[] | null | undefined }) {
  if (!messages?.length) return null
  return (
    <p id={id} className="text-destructive text-sm">
      {messages[0]}
    </p>
  )
}

/** No regular meeting to create: where templates are made, for whoever can make them. */
function NoMeetings({ canManage }: { canManage: boolean }) {
  return (
    <FormSection title={m.programs_new_meetings_title()}>
      <div className="col-span-full flex flex-col items-start gap-2 rounded-md border border-border bg-card p-5">
        <CalendarDays aria-hidden="true" className="size-4 text-faint" />
        <p className="font-medium">{m.programs_new_no_meetings_title()}</p>
        <p className="max-w-prose text-muted-foreground text-sm">{m.programs_new_no_meetings_body()}</p>
        {canManage && (
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/templates">
              <Settings aria-hidden="true" />
              {m.programs_new_no_meetings_link()}
            </Link>
          </Button>
        )}
      </div>
    </FormSection>
  )
}
