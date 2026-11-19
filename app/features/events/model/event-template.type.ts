export enum EventTemplateKey {
  MidweekMeeting = 'midweek-meeting',
  WeekendMeeting = 'weekend-meeting',
  Memorial = 'memorial',
  // No congregation has this template any more (absences are rows of their own): only an archive from before that
  // carries it, and a new template never takes the key.
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
