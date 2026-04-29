import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDatesForWeekdayCount } from '../model/compute-dates'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    programmeTemplate: { findFirst: vi.fn() },
    event: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    programmePartAssignment: { create: vi.fn() },
    programmeServiceRoleAssignment: { create: vi.fn() },
  },
}))

const { generateEventsFromTemplate, createSingleEventFromTemplate } = await import('./programme-generation.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 3, 13, 12, 0, 0)) // Monday April 13, 2026
})

afterEach(() => {
  vi.useRealTimers()
})

describe('computeDatesForWeekdayCount', () => {
  it('returns exactly N dates matching the given weekday', () => {
    const dates = computeDatesForWeekdayCount(2, 5)
    expect(dates.length).toBe(5)
    for (const date of dates) {
      expect(date.getDay()).toBe(2)
    }
  })

  it('includes today if today matches the weekday', () => {
    const dates = computeDatesForWeekdayCount(1, 1)
    expect(dates[0]?.getDate()).toBe(13)
  })

  it('returns the next occurrence if today does not match', () => {
    const dates = computeDatesForWeekdayCount(2, 1)
    expect(dates[0]?.getDate()).toBe(14)
    expect(dates[0]?.getMonth()).toBe(3)
  })

  it('returns an empty array for 0 occurrences', () => {
    const dates = computeDatesForWeekdayCount(2, 0)
    expect(dates.length).toBe(0)
  })
})

describe('generateEventsFromTemplate', () => {
  it('returns empty array when template not found', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue(null as never)
    const result = await generateEventsFromTemplate(db, 999, 2, 1, 1)
    expect(result).toEqual([])
  })

  it('returns empty array when template has no weekDay', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 1,
      weekDay: null,
      parts: [],
      serviceRoles: [],
    } as never)
    const result = await generateEventsFromTemplate(db, 1, 2, 1, 1)
    expect(result).toEqual([])
  })

  it('creates events with assignments for each date', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion de semaine',
      weekDay: 2,
      kindId: null,
      parts: [
        { id: 10, order: 1 },
        { id: 11, order: 2 },
      ],
      serviceRoles: [{ id: 20 }],
    } as never)
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)
    let eventCounter = 0
    vi.mocked(db.event.create).mockImplementation((() => {
      eventCounter++
      return Promise.resolve({ id: eventCounter, name: 'Réunion de semaine' })
    }) as never)
    vi.mocked(db.programmePartAssignment.create).mockResolvedValue({} as never)
    vi.mocked(db.programmeServiceRoleAssignment.create).mockResolvedValue({} as never)

    const result = await generateEventsFromTemplate(db, 1, 2, 1, 1)
    expect(result.length).toBeGreaterThan(0)
  })

  it('propagates template kindId to created events', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion de semaine',
      weekDay: 2,
      kindId: 7,
      parts: [],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)

    await generateEventsFromTemplate(db, 1, 1, 1, 1)

    const call = vi.mocked(db.event.create).mock.calls[0]
    expect((call[0] as { data: { kindId: number } }).data.kindId).toBe(7)
  })

  it('does not set kindId when template has none', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion de semaine',
      weekDay: 2,
      kindId: null,
      parts: [],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)

    await generateEventsFromTemplate(db, 1, 1, 1, 1)

    const call = vi.mocked(db.event.create).mock.calls[0]
    expect((call[0] as { data: { kindId: unknown } }).data.kindId).toBeUndefined()
  })

  it('copies allowExternalSpeaker from template parts to assignments', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion du week-end',
      weekDay: 0,
      kindId: null,
      parts: [
        { id: 10, name: 'Discours', section: '', track: 'A', order: 1, durationMin: 30, allowExternalSpeaker: true },
      ],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)
    vi.mocked(db.programmePartAssignment.create).mockResolvedValue({} as never)

    await generateEventsFromTemplate(db, 1, 2, 1, 1)

    const calls = vi.mocked(db.programmePartAssignment.create).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect((call[0] as { data: { allowExternalSpeaker: boolean } }).data.allowExternalSpeaker).toBe(true)
    }
  })

  it('skips dates where an event already exists', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion de semaine',
      weekDay: 2,
      kindId: null,
      parts: [],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findMany).mockResolvedValue([{ startDate: new Date(2026, 3, 14) }] as never)
    let createCount = 0
    vi.mocked(db.event.create).mockImplementation((() => {
      createCount++
      return Promise.resolve({ id: createCount })
    }) as never)

    // April 14 already exists, so only April 21 is created
    const result = await generateEventsFromTemplate(db, 1, 2, 1, 1)
    expect(result.length).toBe(1)
  })

  it('starts from startFrom date when provided', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion de semaine',
      weekDay: 2,
      kindId: null,
      parts: [],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)
    const createdDates: Date[] = []
    vi.mocked(db.event.create).mockImplementation((({ data }: { data: { startDate: Date } }) => {
      createdDates.push(data.startDate)
      return Promise.resolve({ id: createdDates.length })
    }) as never)

    const startFrom = new Date(2026, 5, 1) // June 1, 2026 (Monday)
    await generateEventsFromTemplate(db, 1, 2, 1, 1, startFrom)

    expect(createdDates[0]?.getFullYear()).toBe(2026)
    expect(createdDates[0]?.getMonth()).toBe(5) // June
  })
})

describe('createSingleEventFromTemplate', () => {
  it('returns null when template not found', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue(null as never)
    const result = await createSingleEventFromTemplate(db, 999, new Date(2026, 3, 20), 1, 1)
    expect(result).toBeNull()
  })

  it('returns null when event already exists on that date', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 3,
      name: 'Mémorial',
      kindId: null,
      parts: [],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)

    const result = await createSingleEventFromTemplate(db, 3, new Date(2026, 3, 20), 1, 1)
    expect(result).toBeNull()
  })

  it('creates a single event with assignments', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 3,
      name: 'Mémorial',
      kindId: null,
      parts: [{ id: 30 }],
      serviceRoles: [{ id: 40 }],
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1, name: 'Mémorial' } as never)
    vi.mocked(db.programmePartAssignment.create).mockResolvedValue({} as never)
    vi.mocked(db.programmeServiceRoleAssignment.create).mockResolvedValue({} as never)

    const result = await createSingleEventFromTemplate(db, 3, new Date(2026, 3, 20), 1, 1)
    expect(result).toEqual({ id: 1, name: 'Mémorial' })
  })

  it('propagates template kindId to the created event', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 3,
      name: 'Mémorial',
      kindId: 9,
      parts: [],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)

    await createSingleEventFromTemplate(db, 3, new Date(2026, 3, 20), 1, 1)

    const call = vi.mocked(db.event.create).mock.calls[0]
    expect((call[0] as { data: { kindId: number } }).data.kindId).toBe(9)
  })

  it('copies allowExternalSpeaker from template parts to assignments', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 3,
      name: 'Mémorial',
      kindId: null,
      parts: [
        { id: 30, name: 'Discours', section: '', track: 'A', order: 1, durationMin: 45, allowExternalSpeaker: true },
      ],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)
    vi.mocked(db.programmePartAssignment.create).mockResolvedValue({} as never)

    await createSingleEventFromTemplate(db, 3, new Date(2026, 3, 20), 1, 1)

    const call = vi.mocked(db.programmePartAssignment.create).mock.calls[0]
    expect((call[0] as { data: { allowExternalSpeaker: boolean } }).data.allowExternalSpeaker).toBe(true)
  })
})
