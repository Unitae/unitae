import { beforeEach, describe, expect, it, vi } from 'vitest'

// Schedules are written beside the items (the schedules' expand step); their own tests cover them.
vi.mock('~/features/events/server/schedules.server', () => ({
  attachEventItems: vi.fn(),
  deleteEventSchedules: vi.fn(),
  eventScheduleId: vi.fn(),
  eventScheduleOfTemplate: vi.fn(),
  eventSchedulesOf: vi.fn(),
  setEventSchedulesStatus: vi.fn(),
}))
vi.mock('~/features/events/server/schedule-templates.server', () => ({
  deleteTemplateScheduleTemplates: vi.fn(),
  syncTemplateScheduleTemplates: vi.fn(),
}))

const auditInTransaction = vi.fn()
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { EventCreated: 'event.created' },
  auditInTransaction: (...args: unknown[]) => auditInTransaction(...args),
}))

const { eventScheduleId, eventScheduleOfTemplate, eventSchedulesOf } = await import(
  '~/features/events/server/schedules.server'
)
const { giveProgramme } = await import('./give-programme.server')

const db = {
  item: { create: vi.fn() },
  schedule: { count: vi.fn().mockResolvedValue(0) },
  itemAllowedRole: { createMany: vi.fn() },
  templateItem: { findMany: vi.fn() },
}

const CTX = { congregationId: 7, timezone: 'Europe/Paris', actorId: 42 }
const TEMPLATE = {
  id: 270,
  name: 'Réunion de semaine',
  weekDay: 4,
  startTime: '19:00',
  endTime: '20:45',
  parts: [
    {
      id: 11,
      name: 'Discours',
      section: 'Joyaux',
      track: '',
      trackOrder: null,
      order: 1,
      durationMin: 10,
      allowExternalSpeaker: false,
      speakerLabel: null,
      readerLabel: null,
      presetId: 3,
      allowedRoles: [
        { roleId: 5, asKind: 'speaker' },
        { roleId: 6, asKind: 'reader' },
      ],
    },
  ],
  serviceParts: [{ id: 21, name: 'Accueil', order: 20, allowedRoles: [] }],
}

beforeEach(() => {
  vi.resetAllMocks()
  // The programme's schedule is 77, the duties' 78: each item lands in the schedule of its kind.
  // A template's services go into a duties schedule of its own (user, 2026-11-27): one here.
  vi.mocked(eventScheduleId).mockResolvedValue(78)
  vi.mocked(eventScheduleOfTemplate).mockResolvedValue(78)
  vi.mocked(eventSchedulesOf).mockImplementation(async (_db, _eventId, kinds) => ({
    programme: kinds.includes('programme') ? 77 : null,
    duty: kinds.includes('duty') ? 78 : null,
  }))
  db.item.create.mockResolvedValueOnce({ id: 700 }).mockResolvedValueOnce({ id: 800 })
  // The template items mirroring the template's part 11 and service 21.
  db.templateItem.findMany.mockResolvedValue([
    { id: 900, legacyPartId: 11, legacyServiceId: null },
    { id: 901, legacyPartId: null, legacyServiceId: 21 },
  ])
})

describe('giveProgramme', () => {
  it('copies the template’s parts and services onto the event, with who may take them', async () => {
    const created = await giveProgramme(db as never, TEMPLATE, 55, '2026-11-19', CTX)

    expect(created).toEqual({ id: 55, templateId: 270, day: '2026-11-19' })
    expect(db.item.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        eventId: 55,
        scheduleId: 77,
        templateItemId: 900,
        name: 'Discours',
        section: 'Joyaux',
        presetId: 3,
        congregationId: 7,
      },
    })
    expect(db.itemAllowedRole.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: [
        { itemId: 700, roleId: 5, slot: 'main', congregationId: 7 },
        { itemId: 700, roleId: 6, slot: 'second', congregationId: 7 },
      ],
    })
    expect(db.item.create.mock.calls[1]?.[0]).toMatchObject({
      data: { eventId: 55, scheduleId: 78, templateItemId: 901, name: 'Accueil', order: 20, congregationId: 7 },
    })
  })

  it('says in the audit trail when the meeting already existed', async () => {
    await giveProgramme(db as never, TEMPLATE, 55, '2026-11-19', CTX, { reused: true })

    expect(auditInTransaction.mock.calls[0]?.[1]).toMatchObject({
      action: 'event.created',
      entityId: 55,
      actorId: 42,
      metadata: { templateId: 270, day: '2026-11-19', reused: true },
    })
  })
})
