import { Permission } from '~/shared/types/permission'
import { dayOf, endOfDay } from '~/shared/utils/calendar-day'

/**
 * When the people who count may enter a meeting's figures: from its start to the end of its local day. After that,
 * only someone allowed to correct attendance changes them.
 */
export function entryWindow(startDate: Date, timeZone: string): { opens: Date; closes: Date } {
  return { opens: startDate, closes: endOfDay(dayOf(startDate, timeZone), timeZone) }
}

export function isEntryOpen(startDate: Date, timeZone: string, now: Date): boolean {
  const { opens, closes } = entryWindow(startDate, timeZone)
  return now >= opens && now <= closes
}

export interface CountWriteRequest {
  startDate: Date
  timeZone: string
  now: Date
  actorId: number
  /** Holds « Saisir l’assistance ». */
  canRecord: boolean
  /** Holds « Corriger l’assistance ». */
  canCorrect: boolean
  /** The count already has a value. */
  hasValue: boolean
  /** Who entered or last changed it; null when empty or when that account was deleted. */
  recordedById: number | null
}

/**
 * Whether `actorId` may set or change one count of a meeting:
 * - a corrector, always;
 * - a recorder, inside the entry window, on an empty count or one they entered themselves.
 */
export function canWriteCount(request: CountWriteRequest): boolean {
  if (request.canCorrect) return true
  if (!request.canRecord) return false
  if (!isEntryOpen(request.startDate, request.timeZone, request.now)) return false
  return !request.hasValue || request.recordedById === request.actorId
}

export interface AttendanceRights {
  canRecord: boolean
  canCorrect: boolean
  canView: boolean
}

/**
 * The caller's attendance rights, named from their permissions: « Saisir l’assistance » enters the meeting under way,
 * « Corriger l’assistance » changes any count at any time, « Consulter l’assistance » reads the averages and the
 * history. What a route hands canWriteCount and the attendance writer, and what opens the attendance page.
 */
export function attendanceRights(permissions: ReadonlySet<Permission>): AttendanceRights {
  return {
    canRecord: permissions.has(Permission.CanRecordAttendance),
    canCorrect: permissions.has(Permission.CanCorrectAttendance),
    canView: permissions.has(Permission.CanViewAttendance),
  }
}
