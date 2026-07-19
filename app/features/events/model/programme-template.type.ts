export enum ProgrammeTemplateKey {
  MidweekMeeting = 'midweek-meeting',
  WeekendMeeting = 'weekend-meeting',
  Memorial = 'memorial',
  DayOff = 'day-off',
  Freeform = 'freeform',
}

const SYSTEM_TEMPLATE_KEYS: readonly string[] = [ProgrammeTemplateKey.DayOff, ProgrammeTemplateKey.Freeform]

/**
 * System templates are seeded by the app itself and back domain concepts
 * (day-off events, freeform events) that would break if the row disappeared
 * or its `key` changed. The settings UI treats them as read-only except for
 * the colour swatch, and the server rejects everything but a `color` update.
 */
export function isSystemTemplate(key: string): boolean {
  return SYSTEM_TEMPLATE_KEYS.includes(key)
}
