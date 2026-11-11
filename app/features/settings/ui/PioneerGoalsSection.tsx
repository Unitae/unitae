import { FormSection, SegmentedControl } from '@unitae/ui'
import { RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { GOAL_FIELDS, goalFieldName } from '~/features/settings/schemas/publisher-settings.schema'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { Input } from '~/shared/ui/input'

export interface GoalYear {
  serviceYear: number
  current: boolean
  goals: { type: PublisherType; defaultRate: number; effectiveRate: number }[]
}

const TYPE_LABEL: Partial<Record<PublisherType, () => string>> = {
  [PublisherType.PionnierPermanant]: m.pioneers_type_permanent,
  [PublisherType.PionnierAuxiliaires]: m.pioneers_type_auxiliary,
  [PublisherType.PionnierSpecial]: m.pioneers_type_special,
  [PublisherType.Missionnaire]: m.pioneers_type_missionary,
}

const yearLabel = (serviceYear: number) =>
  m.pioneers_service_year({ start: String(serviceYear), end: String(serviceYear + 1) })

interface PioneerGoalsSectionProps {
  years: GoalYear[]
  errors: Record<string, string[] | undefined>
}

/**
 * The pioneer goals of the current and the next service year, one row per type. Both years stay in the form, so
 * switching between them keeps what was typed; the save writes only the rows that changed.
 */
export function PioneerGoalsSection({ years, errors }: PioneerGoalsSectionProps) {
  const [shown, setShown] = useState(String(years[0]?.serviceYear))

  return (
    <FormSection title={m.settings_publishers_goals_title()} description={m.settings_publishers_goals_hint()}>
      <div className="col-span-full flex flex-col gap-3">
        <SegmentedControl
          aria-label={m.settings_publishers_goals_year()}
          size="sm"
          className="self-start"
          value={shown}
          onValueChange={setShown}
          options={years.map(year => ({
            value: String(year.serviceYear),
            label: year.current
              ? m.settings_publishers_goals_current({ year: yearLabel(year.serviceYear) })
              : yearLabel(year.serviceYear),
          }))}
        />
        {years.map(year => (
          <div
            key={year.serviceYear}
            hidden={String(year.serviceYear) !== shown}
            className="overflow-hidden rounded-lg border bg-card"
          >
            {GOAL_FIELDS.map(({ field, type }) => {
              const goal = year.goals.find(each => each.type === type)
              if (!goal) return null
              const name = goalFieldName(field, year.serviceYear)
              return (
                <GoalRow
                  key={name}
                  name={name}
                  label={TYPE_LABEL[type]?.() ?? type}
                  defaultRate={goal.defaultRate}
                  saved={goal.effectiveRate}
                  error={errors[name]?.[0]}
                />
              )
            })}
          </div>
        ))}
        <p className="text-faint text-xs">{m.settings_publishers_goals_note()}</p>
      </div>
    </FormSection>
  )
}

interface GoalRowProps {
  name: string
  label: string
  defaultRate: number
  saved: number
  error?: string
}

function GoalRow({ name, label, defaultRate, saved, error }: GoalRowProps) {
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(String(saved))
  const custom = value !== '' && Number(value) !== defaultRate

  // « Rétablir » types the default in, as the person would: the form counts it, and the save drops the custom goal.
  const reset = () => {
    const element = input.current
    // React tracks an input's value; the prototype's setter goes around it, so the event below reaches onChange.
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!element || !setNativeValue) return
    setNativeValue.call(element, String(defaultRate))
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.focus()
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 first:border-t-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium text-sm">{label}</span>
        <span className="text-faint text-sm">
          {custom
            ? m.settings_publishers_goals_custom({ hours: String(defaultRate) })
            : m.settings_publishers_goals_default()}
        </span>
        {error && (
          <span id={`${name}-error`} className="text-destructive text-xs">
            {error}
          </span>
        )}
      </div>
      {custom && (
        <Button type="button" variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
          <RotateCcw aria-hidden="true" />
          {m.settings_publishers_goals_reset({ hours: String(defaultRate) })}
        </Button>
      )}
      <span className="flex items-center gap-2">
        <Input
          ref={input}
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          defaultValue={saved}
          onChange={event => setValue(event.target.value)}
          aria-label={m.settings_publishers_goals_hours_label({ type: label })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-error` : undefined}
          className="w-20 text-right tabular-nums"
        />
        <span className="text-muted-foreground text-sm">{m.settings_publishers_goals_unit()}</span>
      </span>
    </div>
  )
}
