import type { CountOutcome } from '~/features/events/model/attendance-entry'
import { type AttendanceCount, writeAttendanceCount } from '~/features/events/server/attendance.aggregate'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '~/shared/errors/app-error.server'
import { withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('attendance')

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
  // Anything else (the database unreachable, a timeout) is this count not saved: said beside it, never a page error
  // that hides a count already saved.
  return 'failed'
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
      const log = result[count] === 'failed' ? logger.error : logger.warn
      log('Attendance count not saved', { eventId, count, outcome: result[count], actorId: ctx.actorId, error })
    }
  }
  return result
}
