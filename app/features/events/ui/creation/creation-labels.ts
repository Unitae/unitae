import type { CreationSchedule, CreationTemplate, SeriesCount } from '~/features/events/model/programme-creation'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import * as m from '~/i18n/paraglide/messages'
import { addDays } from '~/shared/utils/calendar-day'
import { formatDay } from '~/shared/utils/format-day'

/** A Sunday: the day `weekDay` 0 falls on, the others following it. */
const A_SUNDAY = '2026-11-08'

/** « jeudi », « Thursday »: a template's weekday in the reader's language. */
export function weekdayName(weekDay: number): string {
  return formatDay(addDays(A_SUNDAY, weekDay), { weekday: 'long' })
}

export function hoursLabel(template: { startTime: string; endTime: string }): string {
  return `${template.startTime} – ${template.endTime}`
}

/** « Chaque jeudi · 19:00 – 20:45 », or « Habituellement le jeudi · … » where it can move; the hours alone otherwise. */
export function templateLine(template: CreationTemplate, usually = false): string {
  const hours = hoursLabel(template)
  if (template.weekDay == null) return hours
  const weekday = weekdayName(template.weekDay)
  return usually ? m.programs_new_usually({ weekday, hours }) : m.programs_new_every({ weekday, hours })
}

/** What a schedule holds: « 15 parties », « 4 services ». */
export function scheduleContent(schedule: CreationSchedule): string {
  return schedule.kind === ScheduleKind.Programme
    ? m.programs_new_parts({ count: schedule.items })
    : m.programs_new_services({ count: schedule.items })
}

/** « jeu. 31 déc. ». */
export function shortDate(day: string): string {
  return formatDay(day, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function monthName(day: string): string {
  return formatDay(day, { month: 'long' })
}

export function chipMonth(day: string): string {
  return formatDay(day, { month: 'short' })
}

export function chipDay(day: string): string {
  return formatDay(day, { day: 'numeric' })
}

export function programmesCount(count: number): string {
  if (count === 0) return m.programs_new_count_none()
  return m.programs_new_count({ count: count })
}

/** « 16 réunions · 32 plannings »: the meetings created or filled, and the schedules they arrive with. */
export function meetingsCount(count: SeriesCount): string {
  const meetings = count.create + count.fill
  if (meetings === 0) return m.programs_new_count_none()
  if (count.schedules === 0) return programmesCount(meetings)
  return `${programmesCount(meetings)} · ${m.programs_new_schedules({ count: count.schedules })}`
}

/** What the button does (the user's choice): « Créer 9, compléter 7 », « Créer 16 réunions », « Compléter 7 réunions ». */
export function submitLabel(count: SeriesCount): string {
  if (count.create > 0 && count.fill > 0) return m.programs_new_submit_both({ create: count.create, fill: count.fill })
  if (count.fill > 0) return m.programs_new_submit_fill({ count: count.fill })
  if (count.create > 0) return m.programs_new_submit({ count: count.create })
  return m.programs_new_count_none()
}

/** « 9 nouvelles · 7 déjà créées d’avance, qui reçoivent les leurs · 1 date passée », or « Tous nouveaux ». */
export function restLabel({ create, fill, existing, skipped }: SeriesCount): string {
  const parts: string[] = []
  if (fill > 0) {
    if (create > 0) parts.push(m.programs_new_new({ count: create }))
    parts.push(m.programs_new_fill({ count: fill }))
  }
  if (existing > 0) {
    parts.push(m.programs_new_existing({ count: existing }))
  }
  if (skipped > 0) {
    parts.push(m.programs_new_skipped({ count: skipped }))
  }
  return parts.length > 0 ? parts.join(' · ') : m.programs_new_all_new()
}

export function weeksLabel(count: number): string {
  return m.programs_new_weeks({ count: count })
}
