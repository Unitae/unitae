import { ScheduleStatus } from './schedule.type'

/**
 * The parts of a draft the reader may publish where someone assigned is away that day, which publishing refuses. By
 * part, not by person: `hasConflict` is one flag for the speaker and the reader alike, and the row's own badge shows who.
 */
export function conflictedParts(
  schedule: { status: string; mayPublish: boolean },
  items: { name: string; hasConflict: boolean }[],
): string[] {
  if (schedule.status !== ScheduleStatus.Draft || !schedule.mayPublish) return []
  return items.filter(item => item.hasConflict).map(item => item.name)
}
