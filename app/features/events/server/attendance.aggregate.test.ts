import { beforeEach, describe, expect, it, vi } from 'vitest'

const audit = vi.fn()
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { AttendanceRecorded: 'attendance.recorded', AttendanceCorrected: 'attendance.corrected' },
  audit: (...args: unknown[]) => audit(...args),
}))

const mockDb = {
  event: { findFirst: vi.fn() },
  attendance: { createMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
}

const { writeAttendanceCount } = await import('./attendance.aggregate')
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } = await import(
  '~/shared/errors/app-error.server'
)

const PARIS = 'Europe/Paris'
// Thursday 19 November 2026, 19:00 in Paris.
const START = new Date('2026-11-19T18:00:00Z')
const DURING = new Date('2026-11-19T19:00:00Z')
const NEXT_DAY = new Date('2026-11-20T08:00:00Z')

const request = (overrides: Partial<Parameters<typeof writeAttendanceCount>[1]> = {}) => ({
  congregationId: 1,
  actorId: 7,
  eventId: 40,
  count: 'inPerson' as const,
  value: 98,
  canRecord: true,
  canCorrect: false,
  timeZone: PARIS,
  now: DURING,
  ...overrides,
})

const emptyRow = { inPerson: null, inPersonById: null, online: null, onlineById: null }

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.event.findFirst.mockResolvedValue({ id: 40, startDate: START, template: { attendanceKind: 'weekend' } })
  mockDb.attendance.createMany.mockResolvedValue({ count: 1 })
  mockDb.attendance.findFirst.mockResolvedValue(emptyRow)
  mockDb.attendance.updateMany.mockResolvedValue({ count: 1 })
})

describe('writeAttendanceCount', () => {
  it('creates the row atomically, then writes only that count with its author and time', async () => {
    await writeAttendanceCount(mockDb as never, request())

    expect(mockDb.attendance.createMany).toHaveBeenCalledWith({
      data: [{ eventId: 40, congregationId: 1 }],
      skipDuplicates: true,
    })
    const [[{ where, data }]] = mockDb.attendance.updateMany.mock.calls
    expect(data).toEqual({ inPerson: 98, inPersonById: 7, inPersonAt: DURING })
    expect(where).toMatchObject({ eventId: 40, congregationId: 1 })
  })

  it('writes the online count into its own columns', async () => {
    await writeAttendanceCount(mockDb as never, request({ count: 'online', value: 21 }))

    const [[{ data }]] = mockDb.attendance.updateMany.mock.calls
    expect(data).toEqual({ online: 21, onlineById: 7, onlineAt: DURING })
  })

  it('makes a recorder’s write conditional on the count still being empty or theirs', async () => {
    await writeAttendanceCount(mockDb as never, request())

    const [[{ where }]] = mockDb.attendance.updateMany.mock.calls
    expect(where.OR).toEqual([{ inPerson: null }, { inPersonById: 7 }])
  })

  it('refuses a recorder whose condition no longer holds — someone entered it meanwhile', async () => {
    mockDb.attendance.updateMany.mockResolvedValue({ count: 0 })

    await expect(writeAttendanceCount(mockDb as never, request())).rejects.toBeInstanceOf(ConflictError)
    expect(audit).not.toHaveBeenCalled()
  })

  // The same answer whether the other entry was there before or raced in: « déjà saisi », not « pas le droit ».
  it('refuses a recorder on a count someone else entered as a conflict', async () => {
    mockDb.attendance.findFirst.mockResolvedValue({ ...emptyRow, inPerson: 90, inPersonById: 9 })

    await expect(writeAttendanceCount(mockDb as never, request())).rejects.toBeInstanceOf(ConflictError)
    expect(mockDb.attendance.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a recorder after local midnight', async () => {
    await expect(writeAttendanceCount(mockDb as never, request({ now: NEXT_DAY }))).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('lets a corrector change anything at any time, unconditionally', async () => {
    mockDb.attendance.findFirst.mockResolvedValue({ ...emptyRow, inPerson: 90, inPersonById: 9 })

    await writeAttendanceCount(
      mockDb as never,
      request({ canRecord: false, canCorrect: true, now: NEXT_DAY, value: 92 }),
    )

    const [[{ where }]] = mockDb.attendance.updateMany.mock.calls
    expect(where).toEqual({ eventId: 40, congregationId: 1 })
  })

  it('audits a first entry as recorded', async () => {
    await writeAttendanceCount(mockDb as never, request())

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attendance.recorded',
        congregationId: 1,
        actorId: 7,
        entityType: 'Event',
        metadata: { eventId: 40, count: 'inPerson', from: null, to: 98 },
      }),
    )
  })

  it('audits changing someone else’s count, or any change after midnight, as a correction', async () => {
    mockDb.attendance.findFirst.mockResolvedValue({ ...emptyRow, inPerson: 90, inPersonById: 9 })
    await writeAttendanceCount(mockDb as never, request({ canCorrect: true, value: 92 }))
    expect(audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'attendance.corrected',
        metadata: { eventId: 40, count: 'inPerson', from: 90, to: 92 },
      }),
    )

    mockDb.attendance.findFirst.mockResolvedValue(emptyRow)
    await writeAttendanceCount(mockDb as never, request({ canCorrect: true, now: NEXT_DAY }))
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'attendance.corrected' }))
  })

  it('lets a recorder clear the count they entered', async () => {
    mockDb.attendance.findFirst.mockResolvedValue({ ...emptyRow, inPerson: 98, inPersonById: 7 })

    await writeAttendanceCount(mockDb as never, request({ value: null }))

    const [[{ data }]] = mockDb.attendance.updateMany.mock.calls
    expect(data).toEqual({ inPerson: null, inPersonById: 7, inPersonAt: DURING })
  })

  it('refuses anything but a whole number of people, and writes nothing', async () => {
    for (const value of [-3, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(writeAttendanceCount(mockDb as never, request({ value }))).rejects.toBeInstanceOf(ValidationError)
    }
    expect(mockDb.attendance.createMany).not.toHaveBeenCalled()
  })

  it('writes and audits nothing when the count does not change', async () => {
    mockDb.attendance.findFirst.mockResolvedValue({ ...emptyRow, inPerson: 98, inPersonById: 7 })

    await writeAttendanceCount(mockDb as never, request({ value: 98 }))

    expect(mockDb.attendance.updateMany).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('reports a meeting deleted meanwhile as not found, not as a database error', async () => {
    mockDb.attendance.createMany.mockRejectedValue(Object.assign(new Error('Foreign key'), { code: 'P2003' }))

    await expect(writeAttendanceCount(mockDb as never, request())).rejects.toBeInstanceOf(NotFoundError)
  })

  describe('recorded or corrected', () => {
    const lastAction = () => audit.mock.calls.at(-1)?.[0].action

    it('records a recorder changing their own count during the window', async () => {
      mockDb.attendance.findFirst.mockResolvedValue({ ...emptyRow, inPerson: 90, inPersonById: 7 })
      await writeAttendanceCount(mockDb as never, request({ value: 92 }))
      expect(lastAction()).toBe('attendance.recorded')
    })

    it('records a corrector entering an empty count during the window — the right alone is no correction', async () => {
      await writeAttendanceCount(mockDb as never, request({ canRecord: false, canCorrect: true }))
      expect(lastAction()).toBe('attendance.recorded')
    })

    it('records a corrector entering a count before the meeting starts', async () => {
      await writeAttendanceCount(
        mockDb as never,
        request({ canRecord: false, canCorrect: true, now: new Date('2026-11-19T12:00:00Z') }),
      )
      expect(lastAction()).toBe('attendance.recorded')
    })

    it('corrects a count whose author account was deleted', async () => {
      mockDb.attendance.findFirst.mockResolvedValue({ ...emptyRow, inPerson: 90, inPersonById: null })
      await writeAttendanceCount(mockDb as never, request({ canCorrect: true, value: 91 }))
      expect(lastAction()).toBe('attendance.corrected')
    })

    it('corrects clearing someone else’s count, keeping what it was', async () => {
      mockDb.attendance.findFirst.mockResolvedValue({ ...emptyRow, inPerson: 90, inPersonById: 9 })
      await writeAttendanceCount(mockDb as never, request({ canCorrect: true, value: null }))
      expect(audit.mock.calls.at(-1)?.[0]).toMatchObject({
        action: 'attendance.corrected',
        metadata: { from: 90, to: null },
      })
    })

    it('turns at local midnight exactly', async () => {
      await writeAttendanceCount(
        mockDb as never,
        request({ canCorrect: true, now: new Date('2026-11-19T22:59:59.999Z') }),
      )
      expect(lastAction()).toBe('attendance.recorded')
      await writeAttendanceCount(
        mockDb as never,
        request({ canCorrect: true, now: new Date('2026-11-19T23:00:00.000Z') }),
      )
      expect(lastAction()).toBe('attendance.corrected')
    })
  })

  it('refuses an event of another congregation or one that does not exist', async () => {
    mockDb.event.findFirst.mockResolvedValue(null)

    await expect(writeAttendanceCount(mockDb as never, request())).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuses an event whose template is not counted', async () => {
    mockDb.event.findFirst.mockResolvedValue({ id: 40, startDate: START, template: { attendanceKind: 'none' } })
    await expect(writeAttendanceCount(mockDb as never, request())).rejects.toBeInstanceOf(ValidationError)

    mockDb.event.findFirst.mockResolvedValue({ id: 40, startDate: START, template: null })
    await expect(writeAttendanceCount(mockDb as never, request())).rejects.toBeInstanceOf(ValidationError)
  })
})
