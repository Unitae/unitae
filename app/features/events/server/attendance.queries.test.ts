import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = { event: { findMany: vi.fn() }, attendance: { findFirst: vi.fn() } }

const { eventHasAttendance, listMeetingsUnderWay, listServiceYearAttendance } = await import('./attendance.queries')

const PARIS = 'Europe/Paris'

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 40,
  name: 'Réunion du week-end',
  startDate: new Date('2026-11-15T09:00:00Z'),
  templateId: 2,
  template: { attendanceKind: 'weekend' },
  attendance: {
    inPerson: 98,
    inPersonAt: new Date('2026-11-15T09:41:00Z'),
    inPersonBy: { firstname: 'Paul', lastname: 'MARTIN' },
    online: null,
    onlineAt: null,
    onlineBy: null,
  },
  ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.event.findMany.mockResolvedValue([row()])
})

describe('listServiceYearAttendance', () => {
  it('reads the counted events of the service year, September to August in local time', async () => {
    await listServiceYearAttendance(mockDb as never, { congregationId: 1, serviceYear: 2026, timeZone: PARIS })

    const [[{ where }]] = mockDb.event.findMany.mock.calls
    expect(where.congregationId).toBe(1)
    expect(where.template).toEqual({ attendanceKind: { not: 'none' } })
    // 1 September 2026 00:00 and 31 August 2027 23:59:59.999 in Paris (summer time, UTC+2).
    expect(where.startDate.gte.toISOString()).toBe('2026-08-31T22:00:00.000Z')
    expect(where.startDate.lte.toISOString()).toBe('2027-08-31T21:59:59.999Z')
  })

  it('gives each meeting its local day, kind and both counts with who entered them', async () => {
    const [meeting] = await listServiceYearAttendance(mockDb as never, {
      congregationId: 1,
      serviceYear: 2026,
      timeZone: PARIS,
    })

    expect(meeting).toEqual({
      eventId: 40,
      name: 'Réunion du week-end',
      startDate: new Date('2026-11-15T09:00:00Z'),
      day: '2026-11-15',
      kind: 'weekend',
      templateId: 2,
      inPerson: 98,
      inPersonAt: new Date('2026-11-15T09:41:00Z'),
      inPersonBy: 'Paul MARTIN',
      online: null,
      onlineAt: null,
      onlineBy: null,
    })
  })

  it('reads a meeting nobody has counted yet as two empty counts', async () => {
    mockDb.event.findMany.mockResolvedValue([row({ attendance: null })])

    const [meeting] = await listServiceYearAttendance(mockDb as never, {
      congregationId: 1,
      serviceYear: 2026,
      timeZone: PARIS,
    })

    expect(meeting).toMatchObject({ inPerson: null, online: null, inPersonBy: null, onlineBy: null })
  })

  it('takes the local day, not the UTC one', async () => {
    // 00:30 on 1 December in Paris is still 30 November in UTC.
    mockDb.event.findMany.mockResolvedValue([row({ startDate: new Date('2026-11-30T23:30:00Z') })])

    const [meeting] = await listServiceYearAttendance(mockDb as never, {
      congregationId: 1,
      serviceYear: 2026,
      timeZone: PARIS,
    })

    expect(meeting.day).toBe('2026-12-01')
  })
})

describe('listMeetingsUnderWay', () => {
  it('reads the counted events that started today and are not over yet, whatever their programme status', async () => {
    const now = new Date('2026-11-15T09:30:00Z')

    await listMeetingsUnderWay(mockDb as never, { congregationId: 1, timeZone: PARIS, now })

    const [[{ where }]] = mockDb.event.findMany.mock.calls
    expect(where.congregationId).toBe(1)
    expect(where.template).toEqual({ attendanceKind: { not: 'none' } })
    expect(where.status).toBeUndefined()
    expect(where.startDate.gte.toISOString()).toBe('2026-11-14T23:00:00.000Z')
    expect(where.startDate.lte).toEqual(now)
  })
})

describe('eventHasAttendance', () => {
  // Deleting such a meeting only removes its programme: the dialog says so before.
  it('says whether a meeting has counts, in its congregation', async () => {
    mockDb.attendance.findFirst.mockResolvedValueOnce({ id: 3 }).mockResolvedValueOnce(null)

    expect(await eventHasAttendance(mockDb as never, 40, 1)).toBe(true)
    expect(await eventHasAttendance(mockDb as never, 41, 1)).toBe(false)
    expect(mockDb.attendance.findFirst.mock.calls[0]?.[0]?.where).toEqual({ eventId: 40, congregationId: 1 })
  })
})
