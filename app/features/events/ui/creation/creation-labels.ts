import type { CreationTemplate } from '~/features/events/model/programme-creation'
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

/** « 15 parties, 4 services ». */
export function contentLabel(template: CreationTemplate): string {
  const parts =
    template.parts === 1 ? m.programs_new_parts_one() : m.programs_new_parts_many({ count: String(template.parts) })
  const services =
    template.services === 1
      ? m.programs_new_services_one()
      : m.programs_new_services_many({ count: String(template.services) })
  return `${parts}, ${services}`
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
  return count === 1 ? m.programs_new_count_one() : m.programs_new_count_many({ count: String(count) })
}

export function submitLabel(count: number): string {
  if (count === 0) return m.programs_new_count_none()
  return count === 1 ? m.programs_new_submit_one() : m.programs_new_submit_many({ count: String(count) })
}

/** « 1 existe déjà · 2 dates passées », or « Tous nouveaux ». */
export function restLabel(existing: number, skipped: number): string {
  const parts: string[] = []
  if (existing > 0) {
    parts.push(
      existing === 1 ? m.programs_new_existing_one() : m.programs_new_existing_many({ count: String(existing) }),
    )
  }
  if (skipped > 0) {
    parts.push(skipped === 1 ? m.programs_new_skipped_one() : m.programs_new_skipped_many({ count: String(skipped) }))
  }
  return parts.length > 0 ? parts.join(' · ') : m.programs_new_all_new()
}

export function weeksLabel(count: number): string {
  return count === 1 ? m.programs_new_weeks_one() : m.programs_new_weeks_many({ count: String(count) })
}
