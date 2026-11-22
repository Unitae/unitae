import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withItemMock } from '~/tests/helpers/item-mock'

const listLastWeekAttendance = vi.fn()
vi.mock('~/features/events/index.server', async importOriginal => ({
  ...(await importOriginal<typeof import('~/features/events/index.server')>()),
  listLastWeekAttendance: (...args: unknown[]) => listLastWeekAttendance(...args),
}))

import {
  getContentVersion,
  getDynamicDocumentData,
  getDynamicPreview,
  markDynamicDocumentViewed,
} from './dynamic-documents.server'

const mockDb = withItemMock({
  congregation: {
    findFirstOrThrow: vi.fn(),
  },
  publisherGroup: {
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  member: {
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  pioneerEnrolment: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  event: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  eventPart: {
    findFirst: vi.fn(),
  },
  boardDynamicDocumentView: {
    upsert: vi.fn(),
  },
  setting: {
    findFirst: vi.fn(),
  },
})

beforeEach(() => {
  vi.resetAllMocks()
  mockDb.congregation.findFirstOrThrow.mockResolvedValue({ timezone: 'Europe/Paris' })
})

// --- getDynamicPreview ---

describe('getDynamicPreview', () => {
  it('returns group count for publisher-groups type', async () => {
    mockDb.publisherGroup.count.mockResolvedValue(5)

    const result = await getDynamicPreview(mockDb as never, 'publisher-groups', null, 10)

    expect(result).toBe('5 groupes')
    expect(mockDb.publisherGroup.count).toHaveBeenCalledWith({ where: { congregationId: 10 } })
  })

  it('returns null for publisher-groups when no groups exist', async () => {
    mockDb.publisherGroup.count.mockResolvedValue(0)

    const result = await getDynamicPreview(mockDb as never, 'publisher-groups', null, 10)

    expect(result).toBeNull()
  })

  it('counts members with an enrolment covering the current month, excluding left/inactive', async () => {
    mockDb.pioneerEnrolment.count.mockResolvedValue(3)

    const result = await getDynamicPreview(mockDb as never, 'pioneers', null, 10)

    expect(result).toBe('3 pionniers')
    const call = mockDb.pioneerEnrolment.count.mock.calls[0][0]
    expect(call.where).toMatchObject({
      congregationId: 10,
      member: { leftAt: null, inactiveAt: null, anonymizedAt: null },
    })
    // start ≤ current month AND (ongoing OR end ≥ current month) — the "covers now" window.
    expect(call.where.AND).toHaveLength(2)
  })

  it('returns null for pioneers when none are current', async () => {
    mockDb.pioneerEnrolment.count.mockResolvedValue(0)

    const result = await getDynamicPreview(mockDb as never, 'pioneers', null, 10)

    expect(result).toBeNull()
  })

  it('returns next event date for programme type', async () => {
    const nextDate = new Date('2026-05-15T19:00:00Z')
    mockDb.event.findFirst.mockResolvedValue({ startDate: nextDate })

    const result = await getDynamicPreview(mockDb as never, 'programme', 'midweek', 10)

    expect(result).toContain('Prochain')
    expect(mockDb.event.findFirst).toHaveBeenCalledWith({
      where: {
        congregationId: 10,
        template: { key: 'midweek' },
        startDate: { gte: expect.any(Date) },
        OR: [{ schedules: { some: { status: 'published' } } }, { schedules: { none: {} }, status: 'released' }],
      },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    })
  })

  it('returns null for programme when no future events exist', async () => {
    mockDb.event.findFirst.mockResolvedValue(null)

    const result = await getDynamicPreview(mockDb as never, 'programme', 'midweek', 10)

    expect(result).toBeNull()
  })

  it('returns null for programme without dynamicRef', async () => {
    const result = await getDynamicPreview(mockDb as never, 'programme', null, 10)

    expect(result).toBeNull()
    expect(mockDb.event.findFirst).not.toHaveBeenCalled()
  })

  it('returns null for unknown dynamic type', async () => {
    const result = await getDynamicPreview(mockDb as never, 'unknown-type', null, 10)

    expect(result).toBeNull()
  })
})

// --- getContentVersion ---

describe('getContentVersion', () => {
  it('returns latest date for publisher-groups from group or member', async () => {
    const groupDate = new Date('2026-04-10')
    const memberDate = new Date('2026-04-15')
    mockDb.publisherGroup.findFirst.mockResolvedValue({ updatedAt: groupDate })
    mockDb.member.findFirst.mockResolvedValue({ updatedAt: memberDate })

    const result = await getContentVersion(mockDb as never, 'publisher-groups', null, 10)

    expect(result).toEqual(memberDate)
  })

  it('returns null for publisher-groups when no data exists', async () => {
    mockDb.publisherGroup.findFirst.mockResolvedValue(null)
    mockDb.member.findFirst.mockResolvedValue(null)

    const result = await getContentVersion(mockDb as never, 'publisher-groups', null, 10)

    expect(result).toBeNull()
  })

  it('returns the latest updatedAt across current enrolments and their members', async () => {
    const enrolDate = new Date('2026-04-20')
    const memberDate = new Date('2026-04-25')
    mockDb.pioneerEnrolment.findMany.mockResolvedValue([{ updatedAt: enrolDate, member: { updatedAt: memberDate } }])

    const result = await getContentVersion(mockDb as never, 'pioneers', null, 10)

    expect(result).toEqual(memberDate)
  })

  it('returns null for pioneers when none are current', async () => {
    mockDb.pioneerEnrolment.findMany.mockResolvedValue([])

    const result = await getContentVersion(mockDb as never, 'pioneers', null, 10)

    expect(result).toBeNull()
  })

  it('returns latest date from event or assignment for programme', async () => {
    const eventDate = new Date('2026-04-10')
    const assignmentDate = new Date('2026-04-18')
    mockDb.event.findFirst.mockResolvedValue({ updatedAt: eventDate })
    mockDb.eventPart.findFirst.mockResolvedValue({ updatedAt: assignmentDate })

    const result = await getContentVersion(mockDb as never, 'programme', 'midweek', 10)

    expect(result).toEqual(assignmentDate)
  })

  it('returns null for unknown type', async () => {
    const result = await getContentVersion(mockDb as never, 'unknown', null, 10)

    expect(result).toBeNull()
  })
})

// --- getDynamicDocumentData: pioneers ---

describe('getDynamicDocumentData pioneers', () => {
  it('surfaces the enrolment type and sorts auxiliaries before standing pioneers', async () => {
    // A one-month auxiliary carries type=PionnierAuxiliaires on its enrolment even though the
    // member's own type stays Normal, so the doc must read the enrolment's type, not Member.type.
    mockDb.pioneerEnrolment.findMany.mockResolvedValue([
      { type: 'PionnierPermanant', member: { id: 1, firstname: 'Perm', lastname: 'Ann', anonymizedAt: null } },
      { type: 'PionnierAuxiliaires', member: { id: 2, firstname: 'Aux', lastname: 'Bee', anonymizedAt: null } },
    ])

    const result = await getDynamicDocumentData(mockDb as never, 'pioneers', null, 10)

    expect(result?.type).toBe('pioneers')
    if (result?.type !== 'pioneers') throw new Error('expected pioneers payload')
    expect(result.pioneers.map(p => [p.id, p.type])).toEqual([
      [2, 'PionnierAuxiliaires'],
      [1, 'PionnierPermanant'],
    ])
    const call = mockDb.pioneerEnrolment.findMany.mock.calls[0][0]
    expect(call.where).toMatchObject({
      congregationId: 10,
      member: { leftAt: null, inactiveAt: null, anonymizedAt: null },
    })
    expect(call.where.AND).toHaveLength(2)
  })
})

// --- The current pioneers: the month under way where the congregation is ---

describe('current pioneers month', () => {
  // Noon on 31 October in UTC and in Paris is already 1 November in Auckland.
  const AUCKLAND_NOVEMBER_FIRST = new Date('2026-10-31T12:00:00Z')
  const NOVEMBER = { OR: [{ startYear: { lt: 2026 } }, { startYear: 2026, startMonth: { lte: 10 } }] }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AUCKLAND_NOVEMBER_FIRST)
    mockDb.congregation.findFirstOrThrow.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the stints of the month under way in the congregation’s time zone, as the sheet’s heading names it', async () => {
    mockDb.pioneerEnrolment.findMany.mockResolvedValue([])

    await getDynamicDocumentData(mockDb as never, 'pioneers', null, 10)

    expect(mockDb.pioneerEnrolment.findMany.mock.calls[0][0].where.AND[0]).toEqual(NOVEMBER)
  })

  it('counts the board’s preview on the same month', async () => {
    mockDb.pioneerEnrolment.count.mockResolvedValue(0)

    await getDynamicPreview(mockDb as never, 'pioneers', null, 10)

    expect(mockDb.pioneerEnrolment.count.mock.calls[0][0].where.AND[0]).toEqual(NOVEMBER)
  })
})

// --- getDynamicDocumentData: draft events hidden ---
//
// The board is the public face of the schedule. Any query that surfaces
// programme events to it MUST filter out drafts, otherwise a manager mid-edit
// leaks half-baked assignments to every publisher walking past the screen.

describe('getDynamicDocumentData programme draft filter', () => {
  it('reads only legacy single-template events members may see (D46)', async () => {
    mockDb.event.findMany.mockResolvedValue([])

    await getDynamicDocumentData(mockDb as never, 'programme', 'midweek', 10, { showServices: false })

    expect(mockDb.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ schedules: { some: { status: 'published' } } }, { schedules: { none: {} }, status: 'released' }],
        }),
      }),
    )
  })

  it('reads only multi-template events members may see (D46)', async () => {
    mockDb.event.findMany.mockResolvedValue([])
    const dynamicConfig = { templates: [{ templateId: 1, parts: true, services: false }] }

    await getDynamicDocumentData(mockDb as never, 'programme', null, 10, { dynamicConfig })

    expect(mockDb.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ schedules: { some: { status: 'published' } } }, { schedules: { none: {} }, status: 'released' }],
        }),
      }),
    )
  })
})

// The congregation's choice: off by default, the programme then says nothing about attendance.
describe('getDynamicDocumentData attendance line', () => {
  const read = { timeZone: 'Europe/Paris', now: new Date('2026-11-17T09:00:00Z') }
  const week = [
    { templateId: 7, day: '2026-11-12', total: 86 },
    { templateId: 8, day: '2026-11-15', total: 119 },
  ]

  it('carries last week’s attendance when the congregation shows it on the programme', async () => {
    mockDb.event.findMany.mockResolvedValue([])
    mockDb.setting.findFirst.mockResolvedValue({ value: 'true' })
    listLastWeekAttendance.mockResolvedValue(week)

    const dynamicConfig = {
      templates: [
        { templateId: 7, parts: true, services: false },
        { templateId: 8, parts: true, services: false },
      ],
    }
    const data = await getDynamicDocumentData(mockDb as never, 'programme', null, 10, {
      dynamicConfig,
      attendance: read,
    })

    expect(data).toMatchObject({ attendance: week })
    expect(listLastWeekAttendance).toHaveBeenCalledWith(mockDb, { congregationId: 10, ...read })
  })

  // A cleaning-duties document says nothing about attendance; a midweek-only one, the midweek meeting.
  it('keeps only the meetings of the templates the document lists', async () => {
    mockDb.event.findMany.mockResolvedValue([])
    mockDb.setting.findFirst.mockResolvedValue({ value: 'true' })
    listLastWeekAttendance.mockResolvedValue(week)
    const only = (templateId: number) => ({ templates: [{ templateId, parts: true, services: false }] })

    expect(
      await getDynamicDocumentData(mockDb as never, 'programme', null, 10, {
        dynamicConfig: only(7),
        attendance: read,
      }),
    ).toMatchObject({ attendance: [week[0]] })
    expect(
      await getDynamicDocumentData(mockDb as never, 'programme', null, 10, {
        dynamicConfig: only(99),
        attendance: read,
      }),
    ).toMatchObject({ attendance: null })
  })

  it('carries none when the setting is off, or no meeting was counted last week', async () => {
    mockDb.event.findMany.mockResolvedValue([])
    mockDb.setting.findFirst.mockResolvedValue(null)
    expect(
      await getDynamicDocumentData(mockDb as never, 'programme', 'midweek', 10, { attendance: read }),
    ).toMatchObject({
      attendance: null,
    })
    expect(listLastWeekAttendance).not.toHaveBeenCalled()

    mockDb.setting.findFirst.mockResolvedValue({ value: 'true' })
    listLastWeekAttendance.mockResolvedValue([])
    expect(
      await getDynamicDocumentData(mockDb as never, 'programme', 'midweek', 10, { attendance: read }),
    ).toMatchObject({
      attendance: null,
    })
  })
})

describe('getDynamicPreview programme draft filter', () => {
  it('picks the next event members may see only', async () => {
    mockDb.event.findFirst.mockResolvedValue(null)

    await getDynamicPreview(mockDb as never, 'programme', 'midweek', 10)

    expect(mockDb.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ schedules: { some: { status: 'published' } } }, { schedules: { none: {} }, status: 'released' }],
        }),
      }),
    )
  })
})

describe('getContentVersion programme draft filter', () => {
  it('reads latest event / assignment updatedAt from what members may see only', async () => {
    mockDb.event.findFirst.mockResolvedValue(null)
    mockDb.eventPart.findFirst.mockResolvedValue(null)

    await getContentVersion(mockDb as never, 'programme', 'midweek', 10)

    const eventCall = mockDb.event.findFirst.mock.calls[0][0]
    expect(eventCall.where).toMatchObject({
      OR: [{ schedules: { some: { status: 'published' } } }, { schedules: { none: {} }, status: 'released' }],
    })
    const assignmentCall = mockDb.eventPart.findFirst.mock.calls[0][0]
    expect(assignmentCall.where).toMatchObject({ schedule: { status: 'published' } })
  })
})

// --- markDynamicDocumentViewed ---

describe('markDynamicDocumentViewed', () => {
  it('upserts a view record with current timestamp', async () => {
    mockDb.boardDynamicDocumentView.upsert.mockResolvedValue({})

    await markDynamicDocumentViewed(mockDb as never, 5, 42)

    expect(mockDb.boardDynamicDocumentView.upsert).toHaveBeenCalledWith({
      where: {
        settingsId_userId: { settingsId: 5, userId: 42 },
      },
      create: { settingsId: 5, userId: 42, viewedAt: expect.any(Date) },
      update: { viewedAt: expect.any(Date) },
    })
  })
})
