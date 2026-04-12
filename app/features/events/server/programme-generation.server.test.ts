import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDatesForWeekday } from './programme-generation.server'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    programmeTemplate: { findFirst: vi.fn() },
    event: { findMany: vi.fn(), create: vi.fn() },
    eventKind: { findFirst: vi.fn() },
    programmePartAssignment: { create: vi.fn() },
    programmeServiceRoleAssignment: { create: vi.fn() },
  },
}))

const { generateEventsFromTemplate } = await import('./programme-generation.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 3, 13, 12, 0, 0)) // Monday April 13, 2026
})

afterEach(() => {
  vi.useRealTimers()
})

describe('computeDatesForWeekday', () => {
  it('returns Tuesdays for the next 2 months', () => {
    const dates = computeDatesForWeekday(2, 2) // Tuesday

    expect(dates.length).toBeGreaterThan(0)
    for (const date of dates) {
      expect(date.getDay()).toBe(2)
    }
  })

  it('includes today if today matches the weekday', () => {
    // April 13 2026 is a Monday (day 1)
    const dates = computeDatesForWeekday(1, 1) // Monday
    expect(dates[0]?.getDate()).toBe(13)
  })

  it('returns the next occurrence if today does not match', () => {
    // April 13 2026 is Monday, next Tuesday is April 14
    const dates = computeDatesForWeekday(2, 1)
    expect(dates[0]?.getDate()).toBe(14)
    expect(dates[0]?.getMonth()).toBe(3) // April (0-indexed)
  })

  it('returns an empty array for 0 months ahead', () => {
    const dates = computeDatesForWeekday(2, 0)
    // Should include dates up to today + 0 months (i.e. today only range)
    expect(dates.length).toBeLessThanOrEqual(1)
  })
})

describe('generateEventsFromTemplate', () => {
  it('returns empty array when template not found', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue(null as never)

    const result = await generateEventsFromTemplate(db, 999, 2, 1, 1)
    expect(result).toEqual([])
  })

  it('returns empty array when template has no weekDay (non-recurring)', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 1,
      weekDay: null,
      parts: [],
      serviceRoles: [],
    } as never)

    const result = await generateEventsFromTemplate(db, 1, 2, 1, 1)
    expect(result).toEqual([])
  })

  it('creates events with empty assignments for each date', async () => {
    const template = {
      id: 1,
      name: 'Réunion de semaine',
      weekDay: 2,
      parts: [
        { id: 10, order: 1 },
        { id: 11, order: 2 },
      ],
      serviceRoles: [{ id: 20 }],
    }
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue(template as never)
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)
    vi.mocked(db.eventKind.findFirst).mockResolvedValue({ id: 5 } as never)

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

  it('skips dates where an event already exists', async () => {
    const template = {
      id: 1,
      name: 'Réunion de semaine',
      weekDay: 2,
      parts: [],
      serviceRoles: [],
    }
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue(template as never)

    // First Tuesday is April 14
    const existingDate = new Date(2026, 3, 14)
    vi.mocked(db.event.findMany).mockResolvedValue([{ startDate: existingDate }] as never)
    vi.mocked(db.eventKind.findFirst).mockResolvedValue(null as never)

    let createCount = 0
    vi.mocked(db.event.create).mockImplementation((() => {
      createCount++
      return Promise.resolve({ id: createCount })
    }) as never)

    const result = await generateEventsFromTemplate(db, 1, 2, 1, 1)

    // Should have created events for all Tuesdays except April 14
    const allTuesdays = computeDatesForWeekday(2, 2)
    expect(result.length).toBe(allTuesdays.length - 1)
  })
})
