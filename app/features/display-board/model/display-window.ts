import { endOfDay } from '~/shared/utils/calendar-day'
import { combineLocalDateTime, formatDateForInput } from '~/shared/utils/event-time'

/** « Dès maintenant », « À partir du … », « Pas encore ». */
export type ShowChoice = 'now' | 'from' | 'later'

/** What the form holds: days as `YYYY-MM-DD` in the congregation's zone; `until` empty for « Ne jamais le retirer ». */
export interface DisplayWindowInput {
  show: ShowChoice
  from: string
  until: string
}

export interface DisplayWindow {
  visibleFrom: Date | null
  visibleUntil: Date | null
}

export type DisplayWindowResult =
  | { ok: true; window: DisplayWindow }
  | { ok: false; error: 'missing-from' | 'until-before-from' }

/**
 * The form's choice as the window the board applies, by day in the congregation's zone: a document
 * appears at the start of its first day and leaves at the very end of its last. « Dès maintenant » on
 * a document already shown keeps the start it has, rather than moving it to the moment of the save.
 */
export function toDisplayWindow(
  input: DisplayWindowInput,
  { timeZone, now, current = null }: { timeZone: string; now: Date; current?: Date | null },
): DisplayWindowResult {
  if (input.show === 'from' && input.from === '') return { ok: false, error: 'missing-from' }

  let visibleFrom: Date | null = null
  if (input.show === 'now') visibleFrom = current !== null && current <= now ? current : now
  if (input.show === 'from') visibleFrom = combineLocalDateTime(input.from, '00:00', timeZone)

  const visibleUntil = input.until === '' ? null : endOfDay(input.until, timeZone)
  const start = visibleFrom ?? now
  if (visibleUntil !== null && input.show !== 'later' && visibleUntil < start) {
    return { ok: false, error: 'until-before-from' }
  }
  return { ok: true, window: { visibleFrom, visibleUntil } }
}

/** The board's window as the form shows it; a start not yet chosen offers today. */
export function fromDisplayWindow(
  { visibleFrom, visibleUntil }: DisplayWindow,
  { timeZone, now }: { timeZone: string; now: Date },
): DisplayWindowInput {
  const today = formatDateForInput(now, timeZone)
  const until = visibleUntil === null ? '' : formatDateForInput(visibleUntil, timeZone)
  if (visibleFrom === null) return { show: 'later', from: today, until }
  if (visibleFrom <= now) return { show: 'now', from: today, until }
  return { show: 'from', from: formatDateForInput(visibleFrom, timeZone), until }
}
