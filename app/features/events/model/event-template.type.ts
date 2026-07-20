export enum EventTemplateKey {
  MidweekMeeting = 'midweek-meeting',
  WeekendMeeting = 'weekend-meeting',
  Memorial = 'memorial',
  DayOff = 'day-off',
  Freeform = 'freeform',
}

const SYSTEM_TEMPLATE_KEYS: readonly EventTemplateKey[] = [EventTemplateKey.DayOff, EventTemplateKey.Freeform]

/**
 * System templates are seeded by the app itself and back domain concepts
 * (day-off events, freeform events) that would break if the row disappeared
 * or its `key` changed. The settings UI treats them as read-only except for
 * the colour swatch; `updateTemplate` silently strips every non-`color`
 * field on the write path, and the settings edit route additionally rejects
 * any intent other than `update-template`.
 */
export function isSystemTemplate(key: string): boolean {
  return SYSTEM_TEMPLATE_KEYS.some(k => k === key)
}
