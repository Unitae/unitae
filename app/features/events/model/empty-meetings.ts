import { isSystemTemplate } from '~/features/events/model/event-template.type'
import { addDays } from '~/shared/utils/calendar-day'

/**
 * A meeting waiting for its programme: an event of a template, with neither parts nor services yet — created ahead by
 * the recurring-events job, or emptied when its programme was deleted but its attendance kept. The programmes list
 * says « Pas encore de programme » instead of a draft status, and it cannot be published. « Autre évènement » and
 * absences, both system templates, never wait for one.
 */
export function isAwaitingProgramme(event: {
  parts: number
  services: number
  template: { key: string | null } | null
}): boolean {
  if (event.template == null || (event.template.key != null && isSystemTemplate(event.template.key))) return false
  return event.parts === 0 && event.services === 0
}

/**
 * The day of `weekDay` (0 = Sunday, as on the templates) in the week of `day`, weeks running Monday to Sunday: where a
 * meeting goes when its template changes day, so a deleted week stays deleted and the weekend stays the weekend.
 */
export function dayInSameWeek(day: string, weekDay: number): string {
  const monday = addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
  return addDays(monday, (weekDay + 6) % 7)
}
