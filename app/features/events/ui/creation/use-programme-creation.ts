import { useState } from 'react'

import {
  type CreationTemplate,
  countSeries,
  type ExistingProgramme,
  isRecurring,
  plannedSeries,
  seriesEnds,
  seriesStart,
} from '~/features/events/model/programme-creation'
import { addDays, daysBetween, isCalendarDay } from '~/shared/utils/calendar-day'

export type CreationMode = 'series' | 'single'
/** A template's id, « Autre évènement », or nothing picked yet. */
export type SingleChoice = number | 'freeform' | null

interface Options {
  templates: CreationTemplate[]
  existing: ExistingProgramme[]
  today: string
  canFreeform: boolean
  /** The Monday of a week asked for from the programmes list: the series covers that week only. */
  week: string | null
}

/** The longest series the server accepts, so that the preview never lists what it would refuse. */
const LONGEST_SERIES_DAYS = 365

/**
 * The creation page's state and what follows from it: the programmes a series would hold, counted, and the single
 * programme otherwise. A series starts after the last programmes already created, unless a week was asked for.
 */
export function useProgrammeCreation({ templates, existing, today, canFreeform, week }: Options) {
  const recurring = templates.filter(isRecurring)
  const [mode, setMode] = useState<CreationMode>(recurring.length > 0 ? 'series' : 'single')
  const [selected, setSelected] = useState(() => new Set(recurring.map(template => template.id)))
  const [from, setFrom] = useState(() => (week == null ? seriesStart(recurring, today) : week < today ? today : week))
  const [to, setTo] = useState(() => (week == null ? (seriesEnds(from)[1] ?? from) : addDays(week, 6)))
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set())
  const [choice, setChoice] = useState<SingleChoice>(templates[0]?.id ?? (canFreeform ? 'freeform' : null))
  const [day, setDay] = useState('')
  const [name, setName] = useState('')

  const chosen = recurring.filter(template => selected.has(template.id))
  const periodOk = isCalendarDay(from) && isCalendarDay(to) && to >= from && daysBetween(from, to) < LONGEST_SERIES_DAYS
  const planned = periodOk ? plannedSeries(chosen, from, to, existing) : []
  const count = countSeries(planned, skipped)
  const usualStart = seriesStart(chosen, today)

  return {
    recurring,
    mode,
    setMode,
    selected,
    toggleTemplate: (id: number) =>
      setSelected(current => {
        const next = new Set(current)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    from,
    setFrom,
    to,
    setTo,
    ends: isCalendarDay(from) ? seriesEnds(from) : [],
    /** Set when the period starts right after a programme already created: the day of that programme. */
    follows: from === usualStart && usualStart > today ? addDays(from, -1) : null,
    planned,
    count,
    skipped,
    /** Days the person passed among those the series would create: sent so the server leaves them out. */
    skippedKeys: planned.filter(row => row.existingId == null && skipped.has(row.key)).map(row => row.key),
    toggleSkip: (key: string) =>
      setSkipped(current => {
        const next = new Set(current)
        if (!next.delete(key)) next.add(key)
        return next
      }),
    choice,
    setChoice,
    template: templates.find(template => template.id === choice) ?? null,
    day,
    setDay,
    name,
    setName,
  }
}

export type ProgrammeCreationState = ReturnType<typeof useProgrammeCreation>
