import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, ForbiddenError, ValidationError } from '~/shared/errors/app-error.server'

const scopes: number[] = []
vi.mock('~/shared/infra/db.server', () => ({
  withScope: vi.fn(async (congregationId: number, fn: (db: unknown) => unknown) => {
    scopes.push(congregationId)
    return fn({})
  }),
}))
const writeAttendanceCount = vi.fn()
vi.mock('~/features/events/server/attendance.aggregate', () => ({
  writeAttendanceCount: (...args: unknown[]) => writeAttendanceCount(...args),
}))
vi.mock('~/shared/infra/logger.server', () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn() }) }))

const { recordAttendance } = await import('./record-attendance.server')

const CTX = {
  congregationId: 3,
  actorId: 9,
  canRecord: true,
  canCorrect: false,
  timeZone: 'Europe/Paris',
  now: new Date('2026-11-15T09:45:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  scopes.length = 0
  writeAttendanceCount.mockResolvedValue(undefined)
})

describe('recordAttendance', () => {
  // The usher types the hall and never touches the online field the Zoom host fills: it must stay as it is.
  it('writes only the counts that were sent', async () => {
    const result = await recordAttendance(40, { inPerson: 98 }, CTX)

    expect(result).toEqual({ inPerson: 'saved' })
    expect(writeAttendanceCount).toHaveBeenCalledTimes(1)
    expect(writeAttendanceCount.mock.calls[0]?.[1]).toMatchObject({
      eventId: 40,
      count: 'inPerson',
      value: 98,
      actorId: 9,
      congregationId: 3,
      canRecord: true,
      canCorrect: false,
    })
  })

  // Each count in a transaction of its own: someone else's online count arriving first never undoes the hall.
  it('keeps one count when the other is refused, and says which', async () => {
    writeAttendanceCount.mockImplementation((_db: unknown, write: { count: string }) =>
      write.count === 'online' ? Promise.reject(new ConflictError('taken')) : Promise.resolve(),
    )

    const result = await recordAttendance(40, { inPerson: 98, online: 21 }, CTX)

    expect(result).toEqual({ inPerson: 'saved', online: 'taken' })
    expect(scopes).toEqual([3, 3])
  })

  it('names a closed entry and a number that is not a count', async () => {
    writeAttendanceCount
      .mockRejectedValueOnce(new ForbiddenError('closed'))
      .mockRejectedValueOnce(new ValidationError('online', 'not a count'))

    expect(await recordAttendance(40, { inPerson: 98, online: -1 }, CTX)).toEqual({
      inPerson: 'refused',
      online: 'invalid',
    })
  })

  it('clears a count sent empty', async () => {
    await recordAttendance(40, { online: null }, { ...CTX, canCorrect: true })

    expect(writeAttendanceCount.mock.calls[0]?.[1]).toMatchObject({ count: 'online', value: null })
  })
})
