import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dayOf } from '~/shared/utils/calendar-day'

// Schedules are written beside the items (the schedules' expand step); their own tests cover them.
vi.mock('~/features/events/server/schedules.server', () => ({
  alignEventSchedules: vi.fn(),
  attachEventItems: vi.fn(),
  deleteEventSchedules: vi.fn(),
  eventScheduleId: vi.fn(),
  eventSchedulesOf: vi.fn(),
  setEventSchedulesStatus: vi.fn(),
}))
vi.mock('~/features/events/server/schedule-templates.server', () => ({
  deleteTemplateScheduleTemplates: vi.fn(),
  syncTemplateScheduleTemplates: vi.fn(),
}))

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { EventCreated: 'event.created' },
  auditInTransaction: vi.fn().mockResolvedValue({}),
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventTemplate: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    event: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    item: { create: vi.fn() },
    itemAllowedRole: { createMany: vi.fn() },
    templateItem: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}))

const { eventSchedulesOf } = await import('~/features/events/server/schedules.server')
const { createProgrammeOnDay, createProgrammeSeries, ProgrammeExistsError } = await import(
  './programme-creation.server'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { auditInTransaction } = await import('~/shared/domain/audit.server')
const { NotFoundError } = await import('~/shared/errors/app-error.server')

const MARTINIQUE = 'America/Martinique'
const CTX = { congregationId: 7, timezone: MARTINIQUE, actorId: 42 }
// Each kind of item lands in its event's schedule; the ids are sentinels, told apart from the item ids.
const PROGRAMME_SCHEDULE = 500
const DUTY_SCHEDULE = 600

const MIDWEEK = {
  id: 270,
  key: 'midweek-meeting',
  name: 'Réunion de semaine',
  weekDay: 4,
  startTime: '19:00',
  endTime: '20:45',
  parts: [],
  serviceParts: [],
}
const WEEKEND = {
  ...MIDWEEK,
  id: 271,
  key: 'weekend-meeting',
  name: 'Réunion du week-end',
  weekDay: 0,
  startTime: '10:00',
}

interface CreatedEvent {
  name: string
  templateId: number
  startDate: Date
  endDate: Date
  createdById: number
  congregationId: number
}

/** Records what reaches `event.create`, and answers with ids from 100. */
function recordEvents(): CreatedEvent[] {
  const events: CreatedEvent[] = []
  vi.mocked(db.event.create).mockImplementation((({ data }: { data: CreatedEvent }) => {
    events.push(data)
    return Promise.resolve({ id: 99 + events.length, ...data })
  }) as never)
  return events
}

function hour(date: Date | undefined): string | undefined {
  return date?.toLocaleTimeString('en-GB', { timeZone: MARTINIQUE, hour: '2-digit', minute: '2-digit' })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.event.findMany).mockResolvedValue([] as never)
  vi.mocked(db.event.findFirst).mockResolvedValue(null as never)
  vi.mocked(eventSchedulesOf).mockImplementation(async (_db, _eventId, kinds) =>
    Object.fromEntries(kinds.map(kind => [kind, kind === 'programme' ? PROGRAMME_SCHEDULE : DUTY_SCHEDULE])),
  )
  // A part is item 700, a service item 800.
  vi.mocked(db.item.create).mockImplementation((({ data }: { data: { scheduleId: number } }) =>
    Promise.resolve({ id: data.scheduleId === DUTY_SCHEDULE ? 800 : 700 })) as never)
  vi.mocked(db.templateItem.findMany).mockResolvedValue([] as never)
})

/** The data of the items created in one schedule, in creation order. */
function itemsCreatedIn(scheduleId: number) {
  return vi
    .mocked(db.item.create)
    .mock.calls.map(([arg]) => (arg as { data: { scheduleId: number } }).data)
    .filter(data => data.scheduleId === scheduleId)
}

const WITH_PART = {
  ...MIDWEEK,
  parts: [
    {
      id: 11,
      name: 'Discours',
      section: '',
      track: '',
      trackOrder: null,
      order: 1,
      durationMin: 10,
      allowExternalSpeaker: false,
      speakerLabel: null,
      readerLabel: null,
      presetId: null,
      allowedRoles: [],
    },
  ],
}
const BARE = { createdById: null, origin: 'job', attendance: null, _count: { items: 0 } }

describe('bare events', () => {
  it('gives a bare event of the series its programme instead of creating a second one', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([WITH_PART] as never)
    vi.mocked(db.templateItem.findMany).mockResolvedValue([
      { id: 900, legacyPartId: 11, legacyServiceId: null },
    ] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 55, templateId: 270, startDate: new Date('2026-11-19T23:00:00Z'), ...BARE },
    ] as never)
    const events = recordEvents()

    const result = await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-16', to: '2026-11-22' }, CTX)

    expect(events).toEqual([])
    expect(vi.mocked(db.item.create).mock.calls[0]?.[0]).toMatchObject({
      data: { eventId: 55, scheduleId: PROGRAMME_SCHEDULE, templateItemId: 900 },
    })
    expect(result.created).toEqual([{ id: 55, templateId: 270, day: '2026-11-19' }])
    expect(result.existing).toBe(0)
  })

  it('leaves a day alone when its event already has a programme', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([WITH_PART] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      {
        id: 55,
        templateId: 270,
        startDate: new Date('2026-11-19T23:00:00Z'),
        _count: { items: 3 },
      },
    ] as never)
    recordEvents()

    const result = await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-16', to: '2026-11-22' }, CTX)

    expect(db.item.create).not.toHaveBeenCalled()
    expect(result.existing).toBe(1)
  })

  it('gives a bare event its programme when created on its day', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(WITH_PART as never)
    vi.mocked(db.event.findMany).mockResolvedValue([{ id: 77, ...BARE }] as never)
    recordEvents()

    const created = await createProgrammeOnDay(db, { templateId: 270, day: '2026-11-26' }, CTX)

    expect(created).toEqual({ id: 77, templateId: 270, day: '2026-11-26' })
    expect(db.event.create).not.toHaveBeenCalled()
    expect(vi.mocked(db.item.create).mock.calls[0]?.[0]).toMatchObject({ data: { eventId: 77 } })
  })
})

describe('bare events, edge cases', () => {
  it('deletes an empty meeting on a day the series passes on purpose, and counts it skipped', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([WITH_PART] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 55, templateId: 270, startDate: new Date('2026-11-19T23:00:00Z'), ...BARE },
    ] as never)
    recordEvents()

    const result = await createProgrammeSeries(
      db,
      { templateIds: [270], from: '2026-11-16', to: '2026-11-22', skip: ['270:2026-11-19'] },
      CTX,
    )

    expect(db.event.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 55, congregationId: 7, origin: 'job' }),
    })
    expect(db.item.create).not.toHaveBeenCalled()
    expect(result).toMatchObject({ created: [], skipped: 1 })
  })

  // Made by hand, its author's account since deleted: empty and without an author, but not the job's to delete.
  it('leaves a hand-made meeting on a day the series passes on purpose', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([WITH_PART] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 55, templateId: 270, startDate: new Date('2026-11-19T23:00:00Z'), ...BARE, origin: 'manual' },
    ] as never)
    recordEvents()

    const result = await createProgrammeSeries(
      db,
      { templateIds: [270], from: '2026-11-16', to: '2026-11-22', skip: ['270:2026-11-19'] },
      CTX,
    )

    expect(db.event.deleteMany).not.toHaveBeenCalled()
    expect(result).toMatchObject({ created: [], skipped: 1 })
  })

  it('sets a reused meeting’s hours and name from the template again', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([WITH_PART] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 55, templateId: 270, startDate: new Date('2026-11-19T23:00:00Z'), ...BARE },
    ] as never)
    recordEvents()

    await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-16', to: '2026-11-22' }, CTX)

    expect(vi.mocked(db.event.update).mock.calls[0]?.[0]).toMatchObject({
      where: { id_congregationId: { id: 55, congregationId: 7 } },
      data: { name: 'Réunion de semaine', createdById: 42, origin: 'manual' },
    })
    expect(hour(vi.mocked(db.event.update).mock.calls[0]?.[0]?.data?.startDate as Date)).toBe('19:00')
  })

  // Asked for a programme, a meeting without one gets it — even one someone emptied, or one already counted.
  it('fills a meeting whose programme was removed, and one with counts, when asked for the series', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([WITH_PART] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      {
        id: 55,
        templateId: 270,
        startDate: new Date('2026-11-19T23:00:00Z'),
        ...BARE,
        createdById: 9,
        origin: 'manual',
      },
      { id: 56, templateId: 270, startDate: new Date('2026-11-26T23:00:00Z'), ...BARE, attendance: { id: 1 } },
    ] as never)
    recordEvents()

    const result = await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-16', to: '2026-11-29' }, CTX)

    expect(result.created.map(created => created.id)).toEqual([55, 56])
    expect(result.existing).toBe(0)
  })

  // Made by hand, its author's account since deleted: whoever fills it prepares it, as « Créer le programme » does.
  it('names whoever fills a hand-made meeting without an author, leaving its name and hours', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([WITH_PART] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 55, templateId: 270, startDate: new Date('2026-11-19T23:00:00Z'), ...BARE, origin: 'manual' },
    ] as never)
    recordEvents()

    await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-16', to: '2026-11-22' }, CTX)

    expect(vi.mocked(db.event.update).mock.calls.map(([args]) => args)).toEqual([
      { where: { id_congregationId: { id: 55, congregationId: 7 } }, data: { createdById: 42 } },
    ])
  })

  it('keeps the author, name and hours of a meeting someone prepared before', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([WITH_PART] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      {
        id: 55,
        templateId: 270,
        startDate: new Date('2026-11-19T23:00:00Z'),
        ...BARE,
        createdById: 9,
        origin: 'manual',
      },
    ] as never)
    recordEvents()

    await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-16', to: '2026-11-22' }, CTX)

    expect(db.event.update).not.toHaveBeenCalled()
    expect(db.item.create).toHaveBeenCalled()
  })

  it('never deletes a meeting with counts on a day the series passes, though it has no programme', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([WITH_PART] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 56, templateId: 270, startDate: new Date('2026-11-19T23:00:00Z'), ...BARE, attendance: { id: 1 } },
    ] as never)
    recordEvents()

    const result = await createProgrammeSeries(
      db,
      { templateIds: [270], from: '2026-11-16', to: '2026-11-22', skip: ['270:2026-11-19'] },
      CTX,
    )

    expect(db.event.deleteMany).not.toHaveBeenCalled()
    expect(db.item.create).not.toHaveBeenCalled()
    expect(result).toMatchObject({ created: [], skipped: 1 })
  })

  it('fills a counted meeting without a programme when created on its day', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(WITH_PART as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 56, ...BARE, createdById: 9, origin: 'manual', attendance: { id: 1 } },
    ] as never)
    recordEvents()

    const created = await createProgrammeOnDay(db, { templateId: 270, day: '2026-11-26' }, CTX)

    expect(created.id).toBe(56)
    expect(db.item.create).toHaveBeenCalled()
  })

  it('never reports a programme created when the template has nothing to give', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([MIDWEEK] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 55, templateId: 270, startDate: new Date('2026-11-19T23:00:00Z'), ...BARE },
    ] as never)
    recordEvents()

    const result = await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-16', to: '2026-11-22' }, CTX)

    expect(result).toMatchObject({ created: [], existing: 1 })
  })

  it('lets a prepared programme decide when a day also has an empty meeting', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(WITH_PART as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 55, ...BARE },
      { id: 77, createdById: 42, attendance: null, _count: { items: 5 } },
    ] as never)

    const refusal = await createProgrammeOnDay(db, { templateId: 270, day: '2026-11-26' }, CTX).catch(error => error)

    expect(refusal).toBeInstanceOf(ProgrammeExistsError)
    expect(refusal.eventId).toBe(77)
  })
})

describe('the high-water mark', () => {
  it('moves a template’s mark to the end of a series that reaches past it, so a passed day is never refilled', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([{ ...MIDWEEK, generatedUntil: '2026-11-30' }] as never)
    recordEvents()

    await createProgrammeSeries(
      db,
      { templateIds: [270], from: '2026-11-16', to: '2027-02-28', skip: ['270:2027-02-25'] },
      CTX,
    )

    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    expect(vi.mocked(db.$executeRaw).mock.calls[0]?.slice(1)).toEqual(['2027-02-28', '2027-02-28', 270, 7])
  })

  it('never moves the mark back', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([{ ...MIDWEEK, generatedUntil: '2027-06-30' }] as never)
    recordEvents()

    await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-16', to: '2026-11-30' }, CTX)

    expect(db.$executeRaw).not.toHaveBeenCalled()
  })

  // A single day far ahead says nothing about the weeks before it: moving the mark there would leave them uncreated.
  it('leaves the mark alone when one programme is created beyond it', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ ...MIDWEEK, generatedUntil: '2027-01-16' } as never)
    recordEvents()

    await createProgrammeOnDay(db, { templateId: 270, day: '2027-03-04' }, CTX)

    expect(db.$executeRaw).not.toHaveBeenCalled()
  })

  it('fills the weeks between the mark and a series that starts beyond it, then moves the mark', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([{ ...MIDWEEK, generatedUntil: '2027-01-16' }] as never)
    recordEvents()

    await createProgrammeSeries(db, { templateIds: [270], from: '2027-02-01', to: '2027-02-28' }, CTX)

    const gap = vi.mocked(db.event.createMany).mock.calls[0]?.[0]?.data as { startDate: Date; createdById: null }[]
    expect(gap.map(event => dayOf(event.startDate, MARTINIQUE))).toEqual(['2027-01-21', '2027-01-28'])
    expect(gap.every(event => event.createdById === null)).toBe(true)
    expect(vi.mocked(db.$executeRaw).mock.calls[0]?.slice(1)).toEqual(['2027-02-28', '2027-02-28', 270, 7])
  })

  it('locks the templates before reading which days they already have', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([MIDWEEK] as never)
    const order: string[] = []
    vi.mocked(db.$queryRaw).mockImplementation((() => {
      order.push('lock')
      return Promise.resolve([])
    }) as never)
    vi.mocked(db.event.findMany).mockImplementation((() => {
      order.push('existing')
      return Promise.resolve([])
    }) as never)
    recordEvents()

    await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-16', to: '2026-11-22' }, CTX)

    expect(order).toEqual(['lock', 'existing'])
  })
})

describe('createProgrammeSeries', () => {
  it('creates each template on its weekday of the period, in the congregation zone', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([MIDWEEK, WEEKEND] as never)
    const events = recordEvents()

    const result = await createProgrammeSeries(
      db,
      { templateIds: [270, 271], from: '2026-11-09', to: '2026-11-22' },
      CTX,
    )

    expect(result.created.map(programme => [programme.templateId, programme.day])).toEqual([
      [270, '2026-11-12'],
      [271, '2026-11-15'],
      [270, '2026-11-19'],
      [271, '2026-11-22'],
    ])
    expect(events.map(event => dayOf(event.startDate, MARTINIQUE))).toEqual([
      '2026-11-12',
      '2026-11-15',
      '2026-11-19',
      '2026-11-22',
    ])
    expect(hour(events[0]?.startDate)).toBe('19:00')
    expect(hour(events[0]?.endDate)).toBe('20:45')
    expect(hour(events[1]?.startDate)).toBe('10:00')
  })

  it('names each programme after its template and links it to it', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([MIDWEEK] as never)
    const events = recordEvents()

    await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-12', to: '2026-11-12' }, CTX)

    expect(events).toEqual([
      expect.objectContaining({ name: 'Réunion de semaine', templateId: 270, createdById: 42, congregationId: 7 }),
    ])
  })

  it('leaves out the days that already have the programme, and counts them', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([MIDWEEK, WEEKEND] as never)
    // 19:00 in Martinique on Thursday 19 November is already Friday in UTC.
    vi.mocked(db.event.findMany).mockResolvedValue([
      { templateId: 270, startDate: new Date('2026-11-19T23:00:00Z') },
    ] as never)
    recordEvents()

    const result = await createProgrammeSeries(
      db,
      { templateIds: [270, 271], from: '2026-11-09', to: '2026-11-22' },
      CTX,
    )

    expect(result.created.map(programme => programme.day)).toEqual(['2026-11-12', '2026-11-15', '2026-11-22'])
    expect(result.existing).toBe(1)
  })

  it('does not count another template on the same day as existing', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([MIDWEEK] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { templateId: 272, startDate: new Date('2026-11-12T23:00:00Z') },
    ] as never)
    recordEvents()

    const result = await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-12', to: '2026-11-12' }, CTX)

    expect(result.created).toHaveLength(1)
    expect(result.existing).toBe(0)
  })

  it('leaves out the days asked to be skipped, and counts them', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([MIDWEEK, WEEKEND] as never)
    recordEvents()

    const result = await createProgrammeSeries(
      db,
      { templateIds: [270, 271], from: '2026-11-09', to: '2026-11-22', skip: ['271:2026-11-22', '270:2026-11-15'] },
      CTX,
    )

    expect(result.created.map(programme => programme.day)).toEqual(['2026-11-12', '2026-11-15', '2026-11-19'])
    expect(result.skipped).toBe(1)
  })

  it('creates nothing when every day already has its programme', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([MIDWEEK] as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { templateId: 270, startDate: new Date('2026-11-12T23:00:00Z') },
    ] as never)

    const result = await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-12', to: '2026-11-18' }, CTX)

    expect(result).toEqual({ created: [], existing: 1, skipped: 0 })
    expect(db.event.create).not.toHaveBeenCalled()
  })

  it('refuses a template that is not a regular meeting of the congregation, and creates nothing', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([MIDWEEK] as never)

    await expect(
      createProgrammeSeries(db, { templateIds: [270, 273], from: '2026-11-09', to: '2026-11-22' }, CTX),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(db.event.create).not.toHaveBeenCalled()
  })

  it('refuses a template without a weekday', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([{ ...MIDWEEK, weekDay: null }] as never)

    await expect(
      createProgrammeSeries(db, { templateIds: [270], from: '2026-11-09', to: '2026-11-22' }, CTX),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('records every programme it creates in the audit trail', async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([MIDWEEK] as never)
    recordEvents()

    await createProgrammeSeries(db, { templateIds: [270], from: '2026-11-12', to: '2026-11-19' }, CTX)

    expect(vi.mocked(auditInTransaction).mock.calls.map(([, entry]) => entry)).toEqual([
      expect.objectContaining({
        action: 'event.created',
        actorId: 42,
        congregationId: 7,
        entityType: 'Event',
        entityId: 100,
      }),
      expect.objectContaining({
        action: 'event.created',
        actorId: 42,
        congregationId: 7,
        entityType: 'Event',
        entityId: 101,
      }),
    ])
  })
})

describe('createProgrammeOnDay', () => {
  it('creates the programme on that day at the template hours, in the congregation zone', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ ...MIDWEEK, key: 'memorial', weekDay: null } as never)
    const events = recordEvents()

    const result = await createProgrammeOnDay(db, { templateId: 270, day: '2027-03-23' }, CTX)

    expect(result).toEqual({ id: 100, templateId: 270, day: '2027-03-23' })
    expect(dayOf(events[0]?.startDate ?? new Date(0), MARTINIQUE)).toBe('2027-03-23')
    expect(hour(events[0]?.startDate)).toBe('19:00')
  })

  it('creates a regular meeting on another day than its own, for a week it moves', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(MIDWEEK as never)
    const events = recordEvents()

    await createProgrammeOnDay(db, { templateId: 270, day: '2027-01-19' }, CTX)

    expect(dayOf(events[0]?.startDate ?? new Date(0), MARTINIQUE)).toBe('2027-01-19')
  })

  it('refuses a day the template already has a programme on, naming it', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(MIDWEEK as never)
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 77, createdById: 42, attendance: null, _count: { items: 5 } },
    ] as never)

    const refusal = await createProgrammeOnDay(db, { templateId: 270, day: '2026-11-26' }, CTX).catch(error => error)

    expect(refusal).toBeInstanceOf(ProgrammeExistsError)
    expect(refusal.eventId).toBe(77)
    expect(db.event.create).not.toHaveBeenCalled()
  })

  it('refuses a template the congregation does not offer for programmes', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)

    await expect(createProgrammeOnDay(db, { templateId: 273, day: '2026-11-26' }, CTX)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('records the programme in the audit trail', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(MIDWEEK as never)
    recordEvents()

    await createProgrammeOnDay(db, { templateId: 270, day: '2026-11-26' }, CTX)

    expect(vi.mocked(auditInTransaction).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ action: 'event.created', actorId: 42, entityType: 'Event', entityId: 100 }),
    )
  })
})

describe('what a programme takes from its template', () => {
  // Sentinel labels: a fixture that happened to include a real word would give a false positive.
  it('copies each part in order, with its labels, preset and external speaker choice', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      ...WEEKEND,
      parts: [
        {
          id: 10,
          name: 'Discours public',
          section: '',
          track: 'A',
          trackOrder: null,
          order: 1,
          durationMin: 30,
          allowExternalSpeaker: true,
          speakerLabel: 'SPEAKER-SENTINEL-P1',
          readerLabel: null,
          presetId: 7201,
          allowedRoles: [],
        },
        {
          id: 11,
          name: 'Étude de La Tour de Garde',
          section: '',
          track: 'B',
          trackOrder: null,
          order: 2,
          durationMin: 60,
          allowExternalSpeaker: false,
          speakerLabel: 'SPEAKER-SENTINEL-P2',
          readerLabel: 'READER-SENTINEL-P2',
          presetId: null,
          allowedRoles: [],
        },
      ],
    } as never)
    recordEvents()

    await createProgrammeOnDay(db, { templateId: 271, day: '2026-11-22' }, CTX)

    const parts = itemsCreatedIn(PROGRAMME_SCHEDULE)
    expect(parts).toEqual([
      expect.objectContaining({
        eventId: 100,
        templateItemId: null,
        name: 'Discours public',
        allowExternalSpeaker: true,
        speakerLabel: 'SPEAKER-SENTINEL-P1',
        readerLabel: null,
        presetId: 7201,
        congregationId: 7,
      }),
      expect.objectContaining({
        templateItemId: null,
        allowExternalSpeaker: false,
        speakerLabel: 'SPEAKER-SENTINEL-P2',
        readerLabel: 'READER-SENTINEL-P2',
        presetId: null,
      }),
    ])
  })

  it('copies who may take each part and each service', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      ...MIDWEEK,
      parts: [
        {
          id: 30,
          name: 'Discours',
          section: '',
          track: '',
          trackOrder: null,
          order: 1,
          durationMin: 10,
          allowExternalSpeaker: false,
          speakerLabel: null,
          readerLabel: null,
          presetId: null,
          allowedRoles: [
            { roleId: 7, asKind: 'speaker' },
            { roleId: 8, asKind: 'reader' },
          ],
        },
      ],
      serviceParts: [
        { id: 40, name: 'Son', allowedRoles: [{ roleId: 9 }] },
        { id: 41, name: 'Accueil', allowedRoles: [] },
      ],
    } as never)
    recordEvents()

    await createProgrammeOnDay(db, { templateId: 270, day: '2026-11-26' }, CTX)

    expect(itemsCreatedIn(DUTY_SCHEDULE)).toEqual([
      { eventId: 100, scheduleId: DUTY_SCHEDULE, templateItemId: null, name: 'Son', congregationId: 7 },
      { eventId: 100, scheduleId: DUTY_SCHEDULE, templateItemId: null, name: 'Accueil', congregationId: 7 },
    ])
    expect(vi.mocked(db.itemAllowedRole.createMany).mock.calls).toEqual([
      [
        {
          data: [
            { itemId: 700, roleId: 7, slot: 'main', congregationId: 7 },
            { itemId: 700, roleId: 8, slot: 'second', congregationId: 7 },
          ],
          skipDuplicates: true,
        },
      ],
      [{ data: [{ itemId: 800, roleId: 9, slot: 'main', congregationId: 7 }], skipDuplicates: true }],
    ])
  })
})
