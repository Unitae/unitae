export enum EventTemplateKey {
  MidweekMeeting = 'midweek-meeting',
  WeekendMeeting = 'weekend-meeting',
  Memorial = 'memorial',
  // The template absences were events of, before they got a table of their own; the drop migration deleted it wherever
  // no event with a part, service or attendance kept it. The key stays: an older archive carries it (its events restore
  // as absences), and templateKey keeps a new template off it.
  DayOff = 'day-off',
  Freeform = 'freeform',
}

export const SYSTEM_TEMPLATE_KEYS: readonly EventTemplateKey[] = [EventTemplateKey.Freeform]

/**
 * System templates are seeded by the app itself and back domain concepts
 * (freeform events) that would break if the row disappeared or its `key`
 * changed. The settings UI treats them as read-only except for
 * the colour swatch; `updateTemplate` silently strips every non-`color`
 * field on the write path, and the settings edit route additionally rejects
 * any intent other than `update-template`.
 */
export function isSystemTemplate(key: string): boolean {
  return SYSTEM_TEMPLATE_KEYS.some(k => k === key)
}
