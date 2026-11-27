import { beforeEach, describe, expect, it, vi } from 'vitest'

// « Dupliquer » on a meeting type: another type using the same schedule templates (user, 2026-11-27); the items stay in
// them, the integration test reads what its meetings get.

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventTemplate: { findFirst: vi.fn(), create: vi.fn() },
    eventKindScheduleTemplate: { createMany: vi.fn() },
  },
}))

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { TemplateDuplicated: 'event_template.duplicated' },
  audit: vi.fn(),
}))

const { duplicateTemplate } = await import('./duplicate-template.server')
const { audit } = await import('~/shared/domain/audit.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const source = (overrides: Record<string, unknown> = {}) => ({
  id: 4,
  name: 'Réunion de semaine',
  key: 'midweek-meeting',
  description: 'Vie et ministère',
  weekDay: 4,
  isRecurring: true,
  attendanceKind: 'midweek',
  startTime: '19:00',
  endTime: '20:45',
  scheduleTemplates: [
    { scheduleTemplateId: 8, order: 0 },
    { scheduleTemplateId: 3, order: 1 },
  ],
  ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.eventTemplate.create).mockResolvedValue({ id: 40, name: 'Réunion de semaine (copie)' } as never)
})

describe('duplicateTemplate', () => {
  it('answers null for a type it cannot read, and for a built-in one, writing nothing', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValueOnce(null as never)
    expect(await duplicateTemplate(db, 99, 1, 9)).toBeNull()
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValueOnce(source({ key: 'freeform' }) as never)
    expect(await duplicateTemplate(db, 4, 1, 9)).toBeNull()
    expect(vi.mocked(db.eventTemplate.create).mock.calls).toEqual([])
  })

  it('copies the type’s own fields and links its schedule templates, in their order', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(source() as never)

    const copy = await duplicateTemplate(db, 4, 1, 9)

    expect(copy?.id).toBe(40)
    expect(vi.mocked(db.eventTemplate.create).mock.calls[0][0].data).toMatchObject({
      description: 'Vie et ministère',
      weekDay: 4,
      isRecurring: true,
      attendanceKind: 'midweek',
      startTime: '19:00',
      endTime: '20:45',
      congregationId: 1,
    })
    expect(vi.mocked(db.eventKindScheduleTemplate.createMany).mock.calls[0][0]).toEqual({
      data: [
        { eventKindId: 40, scheduleTemplateId: 8, order: 0, congregationId: 1 },
        { eventKindId: 40, scheduleTemplateId: 3, order: 1, congregationId: 1 },
      ],
    })
  })

  it('links nothing for a type using no template', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(source({ scheduleTemplates: [] }) as never)
    await duplicateTemplate(db, 4, 1, 9)
    expect(vi.mocked(db.eventKindScheduleTemplate.createMany).mock.calls).toEqual([])
  })

  it('says in the audit log which type the copy comes from', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(source() as never)
    await duplicateTemplate(db, 4, 1, 9)
    expect(vi.mocked(audit).mock.calls[0][0]).toMatchObject({
      action: 'event_template.duplicated',
      entityId: 40,
      metadata: { from: 4 },
    })
  })
})
