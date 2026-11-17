import { type AttendanceCount, writeAttendanceCount } from '~/features/events/server/attendance.aggregate'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '~/shared/errors/app-error.server'
import { withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('attendance')

/** What became of one count: saved, entered by someone else first, refused (no right, entry closed), or not a count. */
export type CountOutcome = 'saved' | 'taken' | 'refused' | 'invalid' | 'missing'

export interface RecordContext {
  congregationId: number
  actorId: number
  canRecord: boolean
  canCorrect: boolean
  timeZone: string
  now: Date
}

function outcomeOf(error: unknown): CountOutcome {
  if (error instanceof ConflictError) return 'taken'
  if (error instanceof ForbiddenError) return 'refused'
  if (error instanceof ValidationError) return 'invalid'
  if (error instanceof NotFoundError) return 'missing'
  throw error
}

/**
 * Saves the counts someone typed for a meeting — only those sent: a field left alone is not a count to clear. Each in a
 * transaction of its own, because the hall and the online count come from two people at once: one refused never undoes
 * the other. The rules (who may write what, and when) are the attendance writer's.
 */
export async function recordAttendance(
  eventId: number,
  counts: Partial<Record<AttendanceCount, number | null>>,
  ctx: RecordContext,
): Promise<Partial<Record<AttendanceCount, CountOutcome>>> {
  const result: Partial<Record<AttendanceCount, CountOutcome>> = {}
  for (const count of ['inPerson', 'online'] as const) {
    if (!(count in counts)) continue
    try {
      await withScope(ctx.congregationId, db =>
        writeAttendanceCount(db, { ...ctx, eventId, count, value: counts[count] ?? null }),
      )
      result[count] = 'saved'
    } catch (error) {
      result[count] = outcomeOf(error)
      logger.warn('Attendance count not saved', { eventId, count, outcome: result[count], actorId: ctx.actorId })
    }
  }
  return result
}
