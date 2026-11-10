import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dayOf } from '~/shared/utils/calendar-day'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { EventCreated: 'event.created' },
  auditInTransaction: vi.fn().mockResolvedValue({}),
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventTemplate: { findFirst: vi.fn(), findMany: vi.fn() },
    event: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    eventPart: { create: vi.fn() },
    eventServicePart: { create: vi.fn() },
    eventPartAllowedRole: { createMany: vi.fn() },
    eventServicePartAllowedRole: { createMany: vi.fn() },
  },
}))

const { createProgrammeOnDay, createProgrammeSeries, ProgrammeExistsError } = await import(
  './programme-creation.server'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { auditInTransaction } = await import('~/shared/domain/audit.server')
const { NotFoundError } = await import('~/shared/errors/app-error.server')

const MARTINIQUE = 'America/Martinique'
const CTX = { congregationId: 7, timezone: MARTINIQUE, actorId: 42 }

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
  vi.mocked(db.eventPart.create).mockResolvedValue({ id: 700 } as never)
  vi.mocked(db.eventServicePart.create).mockResolvedValue({ id: 800 } as never)
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
    vi.mocked(db.event.findFirst).mockResolvedValue({ id: 77 } as never)

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

    const parts = vi.mocked(db.eventPart.create).mock.calls.map(([arg]) => (arg as { data: unknown }).data)
    expect(parts).toEqual([
      expect.objectContaining({
        eventId: 100,
        partId: 10,
        name: 'Discours public',
        allowExternalSpeaker: true,
        speakerLabel: 'SPEAKER-SENTINEL-P1',
        readerLabel: null,
        presetId: 7201,
        congregationId: 7,
      }),
      expect.objectContaining({
        partId: 11,
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

    expect(vi.mocked(db.eventServicePart.create).mock.calls.map(([arg]) => (arg as { data: unknown }).data)).toEqual([
      { eventId: 100, servicePartId: 40, name: 'Son', congregationId: 7 },
      { eventId: 100, servicePartId: 41, name: 'Accueil', congregationId: 7 },
    ])
    expect(vi.mocked(db.eventPartAllowedRole.createMany).mock.calls).toEqual([
      [
        {
          data: [
            { eventPartId: 700, roleId: 7, asKind: 'speaker', congregationId: 7 },
            { eventPartId: 700, roleId: 8, asKind: 'reader', congregationId: 7 },
          ],
          skipDuplicates: true,
        },
      ],
    ])
    expect(vi.mocked(db.eventServicePartAllowedRole.createMany).mock.calls).toEqual([
      [{ data: [{ eventServicePartId: 800, roleId: 9, congregationId: 7 }], skipDuplicates: true }],
    ])
  })
})
