import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDatesForWeekdayCount } from '../model/compute-dates'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventTemplate: { findFirst: vi.fn() },
    event: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    eventPart: { create: vi.fn() },
    eventServiceRole: { create: vi.fn() },
    eventPartAllowedRole: { createMany: vi.fn() },
    eventServiceRoleAllowedRole: { createMany: vi.fn() },
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

const TZ = 'UTC'

describe('generateEventsFromTemplate', () => {
  it('returns empty array when template not found', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)
    const result = await generateEventsFromTemplate(db, 999, 2, 1, 1, TZ)
    expect(result).toEqual([])
  })

  it('returns empty array when template has no weekDay', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 1,
      weekDay: null,
      startTime: '19:00',
      endTime: '21:00',
      parts: [],
      serviceRoles: [],
    } as never)
    const result = await generateEventsFromTemplate(db, 1, 2, 1, 1, TZ)
    expect(result).toEqual([])
  })

  it('creates events with assignments for each date', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion de semaine',
      weekDay: 2,
      kindId: null,
      startTime: '19:00',
      endTime: '21:00',
      parts: [
        { id: 10, order: 1, allowedRoles: [] },
        { id: 11, order: 2, allowedRoles: [] },
      ],
      serviceRoles: [{ id: 20, allowedRoles: [] }],
    } as never)
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)
    let eventCounter = 0
    vi.mocked(db.event.create).mockImplementation((() => {
      eventCounter++
      return Promise.resolve({ id: eventCounter, name: 'Réunion de semaine' })
    }) as never)
    vi.mocked(db.eventPart.create).mockResolvedValue({} as never)
    vi.mocked(db.eventServiceRole.create).mockResolvedValue({} as never)

    const result = await generateEventsFromTemplate(db, 1, 2, 1, 1, TZ)
    expect(result.length).toBeGreaterThan(0)
  })

  it('links every created event to the source template', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 42,
      name: 'Réunion de semaine',
      weekDay: 2,
      startTime: '19:00',
      endTime: '21:00',
      parts: [],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)

    await generateEventsFromTemplate(db, 42, 1, 1, 1, TZ)

    const call = vi.mocked(db.event.create).mock.calls[0]
    expect((call[0] as { data: { templateId: number } }).data.templateId).toBe(42)
  })

  // Sentinel labels — a fixture that happened to include a real word would
  // give a false positive. Distinct strings prove the value is threaded from
  // the template, not fabricated by the caller.
  it('copies speakerLabel and readerLabel from template parts to assignments (Layer 4)', async () => {
    vi.mocked(db.programmeTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion du week-end',
      weekDay: 0,
      kindId: null,
      startTime: '10:00',
      endTime: '12:00',
      parts: [
        {
          id: 10,
          name: 'Bible reading',
          section: '',
          track: 'A',
          order: 1,
          durationMin: 5,
          allowExternalSpeaker: false,
          // Distinct sentinels per part so an ordering regression (swapping
          // parts[0] and parts[1] during the copy) fails visibly.
          speakerLabel: 'STUDENT-SENTINEL-P1',
          readerLabel: null,
          allowedRoles: [],
        },
        {
          id: 11,
          name: 'Return visit',
          section: '',
          track: 'B',
          order: 2,
          durationMin: 10,
          allowExternalSpeaker: false,
          speakerLabel: 'STUDENT-SENTINEL-P2',
          readerLabel: 'HOUSEHOLDER-SENTINEL-P2',
          allowedRoles: [],
        },
      ],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)
    vi.mocked(db.programmePartAssignment.create).mockResolvedValue({} as never)

    await generateEventsFromTemplate(db, 1, 1, 1, 1, TZ)

    const calls = vi.mocked(db.programmePartAssignment.create).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    const firstData = (calls[0][0] as { data: { speakerLabel: string | null; readerLabel: string | null } }).data
    expect(firstData.speakerLabel).toBe('STUDENT-SENTINEL-P1')
    expect(firstData.readerLabel).toBeNull()
    const secondData = (calls[1][0] as { data: { speakerLabel: string | null; readerLabel: string | null } }).data
    expect(secondData.speakerLabel).toBe('STUDENT-SENTINEL-P2')
    expect(secondData.readerLabel).toBe('HOUSEHOLDER-SENTINEL-P2')
  })

  it('copies allowExternalSpeaker from template parts to assignments', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion du week-end',
      weekDay: 0,
      startTime: '10:00',
      endTime: '12:00',
      parts: [
        {
          id: 10,
          name: 'Discours',
          section: '',
          track: 'A',
          order: 1,
          durationMin: 30,
          allowExternalSpeaker: true,
          allowedRoles: [],
        },
      ],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)
    vi.mocked(db.eventPart.create).mockResolvedValue({} as never)

    await generateEventsFromTemplate(db, 1, 2, 1, 1, TZ)

    const calls = vi.mocked(db.eventPart.create).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect((call[0] as { data: { allowExternalSpeaker: boolean } }).data.allowExternalSpeaker).toBe(true)
    }
  })

  it('skips dates where an event already exists', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion de semaine',
      weekDay: 2,
      kindId: null,
      startTime: '19:00',
      endTime: '21:00',
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
    const result = await generateEventsFromTemplate(db, 1, 2, 1, 1, TZ)
    expect(result.length).toBe(1)
  })

  it('starts from startFrom date when provided', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion de semaine',
      weekDay: 2,
      kindId: null,
      startTime: '19:00',
      endTime: '21:00',
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
    await generateEventsFromTemplate(db, 1, 2, 1, 1, TZ, startFrom)

    expect(createdDates[0]?.getFullYear()).toBe(2026)
    expect(createdDates[0]?.getMonth()).toBe(5) // June
  })

  it('uses the template hours in the target timezone', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 1,
      name: 'Réunion de semaine',
      weekDay: 2,
      kindId: null,
      startTime: '17:30',
      endTime: '19:00',
      parts: [],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)
    const startDates: Date[] = []
    const endDates: Date[] = []
    vi.mocked(db.event.create).mockImplementation((({ data }: { data: { startDate: Date; endDate: Date } }) => {
      startDates.push(data.startDate)
      endDates.push(data.endDate)
      return Promise.resolve({ id: startDates.length })
    }) as never)

    await generateEventsFromTemplate(db, 1, 1, 1, 1, 'Europe/Paris')

    expect(
      startDates[0]?.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }),
    ).toBe('17:30')
    expect(
      endDates[0]?.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }),
    ).toBe('19:00')
  })
})

describe('createSingleEventFromTemplate', () => {
  it('returns null when template not found', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)
    const result = await createSingleEventFromTemplate(db, 999, new Date(2026, 3, 20), 1, 1, TZ)
    expect(result).toBeNull()
  })

  it('returns null when event already exists on that date', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 3,
      name: 'Mémorial',
      kindId: null,
      startTime: '19:00',
      endTime: '21:00',
      parts: [],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 99 } as never)

    const result = await createSingleEventFromTemplate(db, 3, new Date(2026, 3, 20), 1, 1, TZ)
    expect(result).toBeNull()
  })

  it('creates a single event with assignments', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 3,
      name: 'Mémorial',
      kindId: null,
      startTime: '19:00',
      endTime: '21:00',
      parts: [{ id: 30, allowedRoles: [] }],
      serviceRoles: [{ id: 40, allowedRoles: [] }],
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1, name: 'Mémorial' } as never)
    vi.mocked(db.eventPart.create).mockResolvedValue({} as never)
    vi.mocked(db.eventServiceRole.create).mockResolvedValue({} as never)

    const result = await createSingleEventFromTemplate(db, 3, new Date(2026, 3, 20), 1, 1, TZ)
    expect(result).toEqual({ id: 1, name: 'Mémorial' })
  })

  it('links the created event to the source template', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 3,
      name: 'Mémorial',
      startTime: '19:00',
      endTime: '21:00',
      parts: [],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)

    await createSingleEventFromTemplate(db, 3, new Date(2026, 3, 20), 1, 1, TZ)

    const call = vi.mocked(db.event.create).mock.calls[0]
    expect((call[0] as { data: { templateId: number } }).data.templateId).toBe(3)
  })

  it('copies allowExternalSpeaker from template parts to assignments', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 3,
      name: 'Mémorial',
      kindId: null,
      startTime: '19:00',
      endTime: '21:00',
      parts: [
        {
          id: 30,
          name: 'Discours',
          section: '',
          track: 'A',
          order: 1,
          durationMin: 45,
          allowExternalSpeaker: true,
          allowedRoles: [],
        },
      ],
      serviceRoles: [],
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 1 } as never)
    vi.mocked(db.eventPart.create).mockResolvedValue({} as never)

    await createSingleEventFromTemplate(db, 3, new Date(2026, 3, 20), 1, 1, TZ)

    const call = vi.mocked(db.eventPart.create).mock.calls[0]
    expect((call[0] as { data: { allowExternalSpeaker: boolean } }).data.allowExternalSpeaker).toBe(true)
  })

  it('copies non-empty allowed-role lists from template parts and service roles to assignments', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 3,
      name: 'Mémorial',
      kindId: null,
      startTime: '19:00',
      endTime: '21:00',
      parts: [
        {
          id: 30,
          name: 'Discours',
          section: '',
          track: '',
          trackOrder: null,
          order: 1,
          durationMin: 45,
          allowExternalSpeaker: false,
          allowedRoles: [
            { roleId: 7, asKind: 'speaker' },
            { roleId: 8, asKind: 'reader' },
          ],
        },
      ],
      serviceRoles: [{ id: 40, name: 'Son', allowedRoles: [{ roleId: 9 }] }],
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 555 } as never)
    vi.mocked(db.eventPart.create).mockResolvedValue({ id: 700 } as never)
    vi.mocked(db.eventServiceRole.create).mockResolvedValue({ id: 800 } as never)
    vi.mocked(db.eventPartAllowedRole.createMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(db.eventServiceRoleAllowedRole.createMany).mockResolvedValue({ count: 1 } as never)

    await createSingleEventFromTemplate(db, 3, new Date(2026, 3, 20), 42, 7, TZ)

    expect(vi.mocked(db.eventPartAllowedRole.createMany)).toHaveBeenCalledWith({
      data: [
        { assignmentId: 700, roleId: 7, asKind: 'speaker', congregationId: 7 },
        { assignmentId: 700, roleId: 8, asKind: 'reader', congregationId: 7 },
      ],
      skipDuplicates: true,
    })
    expect(vi.mocked(db.eventServiceRoleAllowedRole.createMany)).toHaveBeenCalledWith({
      data: [{ assignmentId: 800, roleId: 9, congregationId: 7 }],
      skipDuplicates: true,
    })
  })

  it('skips allowed-role createMany when lists are empty', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      id: 3,
      name: 'Mémorial',
      kindId: null,
      startTime: '19:00',
      endTime: '21:00',
      parts: [
        {
          id: 30,
          name: 'Discours',
          section: '',
          track: '',
          trackOrder: null,
          order: 1,
          durationMin: 45,
          allowExternalSpeaker: false,
          allowedRoles: [],
        },
      ],
      serviceRoles: [{ id: 40, name: 'Son', allowedRoles: [] }],
    } as never)
    vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
    vi.mocked(db.event.create).mockResolvedValue({ id: 555 } as never)
    vi.mocked(db.eventPart.create).mockResolvedValue({ id: 700 } as never)
    vi.mocked(db.eventServiceRole.create).mockResolvedValue({ id: 800 } as never)

    await createSingleEventFromTemplate(db, 3, new Date(2026, 3, 20), 42, 7, TZ)

    expect(vi.mocked(db.eventPartAllowedRole.createMany)).not.toHaveBeenCalled()
    expect(vi.mocked(db.eventServiceRoleAllowedRole.createMany)).not.toHaveBeenCalled()
  })
})
