import { FormSection } from '@unitae/ui'
import { Clock } from 'lucide-react'
import { Link } from 'react-router'

import type { CreationTemplate } from '~/features/events/model/programme-creation'
import * as m from '~/i18n/paraglide/messages'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '~/shared/ui/radio-group'
import { isCalendarDay } from '~/shared/utils/calendar-day'
import { cn } from '~/shared/utils/utils'

import { DayField, FieldError } from './CreationSeriesSections'
import { hoursLabel, templateLine, weekdayName } from './creation-labels'
import type { ProgrammeCreationState } from './use-programme-creation'

const FREEFORM = 'freeform'

interface SectionsProps {
  state: ProgrammeCreationState
  templates: CreationTemplate[]
  errors: Record<string, string[] | null | undefined>
  today: string
  canFreeform: boolean
  /** The programme the template already has on the day refused. */
  existingId: number | undefined
}

/** « Une seule date »: any template, a regular meeting included, or another event with its own name and hours. */
export function CreationSingleSections({ state, templates, errors, today, canFreeform, existingId }: SectionsProps) {
  const { template } = state
  const freeform = state.choice === FREEFORM
  const weekDay = isCalendarDay(state.day) ? new Date(`${state.day}T12:00:00Z`).getUTCDay() : null
  const moved = template?.weekDay != null && weekDay != null && weekDay !== template.weekDay

  return (
    <>
      <FormSection title={m.programs_new_template_title()} description={m.programs_new_template_description()}>
        <RadioGroup
          value={state.choice == null ? '' : String(state.choice)}
          onValueChange={value => state.setChoice(value === FREEFORM ? FREEFORM : Number(value))}
          aria-label={m.programs_new_template_title()}
          className="col-span-full gap-1.5"
        >
          {templates.map(option => (
            <ChoiceCard
              key={option.id}
              value={String(option.id)}
              picked={state.choice === option.id}
              color={option.color}
              label={option.name}
              description={templateLine(option, true)}
            />
          ))}
          {canFreeform && (
            <ChoiceCard
              value={FREEFORM}
              picked={freeform}
              label={m.programs_new_freeform_name()}
              description={m.programs_new_freeform_description()}
            />
          )}
        </RadioGroup>
        {template != null && <input type="hidden" name="templateId" value={template.id} />}
        <FieldError messages={errors.templateId} />
      </FormSection>

      {(template != null || freeform) && (
        <FormSection
          title={m.programs_new_date_title()}
          description={
            freeform ? m.programs_new_date_description_freeform() : m.programs_new_date_description_template()
          }
        >
          {freeform && (
            <div className="col-span-full flex flex-col gap-1.5">
              <Label htmlFor="creation-name">{m.programs_new_name_label()}</Label>
              <Input
                id="creation-name"
                name="name"
                value={state.name}
                onChange={event => state.setName(event.target.value)}
                aria-invalid={errors.name != null}
              />
              <FieldError messages={errors.name} />
            </div>
          )}
          <DayField
            id="creation-day"
            name="day"
            label={m.programs_new_day_label()}
            value={state.day}
            onChange={state.setDay}
            min={today}
            errors={errors.day}
          />
          {existingId != null && errors.day != null && (
            <Link
              to={`/programs/events/${existingId}`}
              className="col-span-full -mt-2 text-brand-text text-sm underline-offset-4 hover:underline"
            >
              {m.programs_new_see_existing()}
            </Link>
          )}
          {freeform ? (
            <FreeformHours errors={errors} />
          ) : (
            template != null && (
              <p className="col-span-full flex items-center gap-2 justify-self-start rounded-md bg-sidebar px-2.5 py-2 text-muted-foreground text-sm tabular-nums">
                <Clock aria-hidden="true" className="size-4 text-faint" />
                {m.programs_new_template_hours({ hours: hoursLabel(template) })}
              </p>
            )
          )}
          {moved && template?.weekDay != null && weekDay != null && (
            <p className="col-span-full text-faint text-sm">
              {m.programs_new_moved_hint({ weekday: weekdayName(weekDay), usual: weekdayName(template.weekDay) })}
            </p>
          )}
        </FormSection>
      )}
    </>
  )
}

function FreeformHours({ errors }: { errors: Record<string, string[] | null | undefined> }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="creation-start">{m.programs_new_start_label()}</Label>
        <Input id="creation-start" name="startTime" type="time" aria-invalid={errors.startTime != null} />
        <FieldError messages={errors.startTime} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="creation-end">{m.programs_new_end_label()}</Label>
        <Input id="creation-end" name="endTime" type="time" aria-invalid={errors.endTime != null} />
        <FieldError messages={errors.endTime} />
      </div>
    </>
  )
}

function ChoiceCard({
  value,
  picked,
  color,
  label,
  description,
}: {
  value: string
  picked: boolean
  color?: string
  label: string
  description: string
}) {
  const id = `creation-choice-${value}`
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors duration-(--u-duration-fast)',
        picked ? 'border-brand bg-brand-soft' : 'border-border hover:bg-hover',
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 font-medium text-sm">
          {color != null && (
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          )}
          {label}
        </span>
        <span className="text-muted-foreground text-sm tabular-nums">{description}</span>
      </span>
    </label>
  )
}
