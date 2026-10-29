import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { combineLocalDateTime } from '~/shared/utils/event-time'
import { zonedNow } from '~/shared/utils/zoned-now'

// The printable programme covers this month and the next, in the congregation's timezone: what a
// board needs pinned up, without the months ahead that would only make it longer. The board
// screen keeps every released meeting from the start of the month.

export interface ProgrammeSheetWindow {
  start: Date
  /** The first instant after the window: the 1st of the month after next. */
  end: Date
}

function firstOfMonth(year: number, month: number, timezone: string): Date {
  const date = new Date(year, month, 1)
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
  return combineLocalDateTime(day, '00:00', timezone)
}

export function programmeSheetWindow(now: Date, timezone: string): ProgrammeSheetWindow {
  const local = zonedNow(timezone, now)
  return {
    start: firstOfMonth(local.getFullYear(), local.getMonth(), timezone),
    end: firstOfMonth(local.getFullYear(), local.getMonth() + 2, timezone),
  }
}

/**
 * The events the sheet prints. A viewer opened on one event (a notification's deep link) prints
 * that event wherever it falls, since it is what the reader is looking at.
 */
export function eventsForSheet<E extends { startDate: Date | string }>(
  events: E[],
  window: ProgrammeSheetWindow,
  narrowedToEvent: boolean,
): E[] {
  if (narrowedToEvent) return events
  return events.filter(event => {
    const time = new Date(event.startDate).getTime()
    return time >= window.start.getTime() && time < window.end.getTime()
  })
}

/**
 * What a document's sheet prints: a programme kept to its window, any other document as it is.
 * One rule for the download route and the viewer's button, so the button never offers a sheet the
 * route would refuse as empty.
 */
export function sheetDataFor<D extends { type: string; events?: { startDate: Date | string }[] }>(
  data: D,
  { now, timezone, narrowedToEvent }: { now: Date; timezone: string; narrowedToEvent: boolean },
): D {
  if (data.type !== DynamicType.Programme || !data.events) return data
  return { ...data, events: eventsForSheet(data.events, programmeSheetWindow(now, timezone), narrowedToEvent) }
}
