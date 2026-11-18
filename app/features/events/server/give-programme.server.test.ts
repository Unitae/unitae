import { beforeEach, describe, expect, it, vi } from 'vitest'

const auditInTransaction = vi.fn()
vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { EventCreated: 'event.created' },
  auditInTransaction: (...args: unknown[]) => auditInTransaction(...args),
}))

const { giveProgramme } = await import('./give-programme.server')

const db = {
  eventPart: { create: vi.fn() },
  eventServicePart: { create: vi.fn() },
  eventPartAllowedRole: { createMany: vi.fn() },
  eventServicePartAllowedRole: { createMany: vi.fn() },
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
      allowedRoles: [{ roleId: 5, asKind: 'speaker' }],
    },
  ],
  serviceParts: [{ id: 21, name: 'Accueil', order: 20, allowedRoles: [] }],
}

beforeEach(() => {
  vi.resetAllMocks()
  db.eventPart.create.mockResolvedValue({ id: 700 })
  db.eventServicePart.create.mockResolvedValue({ id: 800 })
})

describe('giveProgramme', () => {
  it('copies the template’s parts and services onto the event, with who may take them', async () => {
    const created = await giveProgramme(db as never, TEMPLATE, 55, '2026-11-19', CTX)

    expect(created).toEqual({ id: 55, templateId: 270, day: '2026-11-19' })
    expect(db.eventPart.create.mock.calls[0]?.[0]).toMatchObject({
      data: { eventId: 55, partId: 11, name: 'Discours', section: 'Joyaux', presetId: 3, congregationId: 7 },
    })
    expect(db.eventPartAllowedRole.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: [{ eventPartId: 700, roleId: 5, asKind: 'speaker', congregationId: 7 }],
    })
    expect(db.eventServicePart.create.mock.calls[0]?.[0]).toMatchObject({
      data: { eventId: 55, servicePartId: 21, name: 'Accueil', order: 20 },
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
