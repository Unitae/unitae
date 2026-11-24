import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'

// Schedules are written beside the items (the schedules' expand step); their own tests cover them.
vi.mock('~/features/events/server/schedules.server', () => ({
  attachEventItems: vi.fn(),
  deleteEventSchedules: vi.fn(),
  eventScheduleId: vi.fn(),
  setEventSchedulesStatus: vi.fn(),
}))
vi.mock('~/features/events/server/schedule-templates.server', () => ({
  deleteTemplateScheduleTemplates: vi.fn(),
  syncTemplateScheduleTemplates: vi.fn(),
}))

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventTemplate: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    event: { count: vi.fn() },
    templatePart: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    templateServicePart: { aggregate: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    templateResponsible: { upsert: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    eventKindScheduleTemplate: { findFirst: vi.fn() },
    role: { findMany: vi.fn() },
    templatePartAllowedRole: { createMany: vi.fn() },
    templateServicePartAllowedRole: { createMany: vi.fn() },
  },
}))

vi.mock('~/features/events/server/allowed-roles.server', () => ({
  setTemplatePartAllowedRoles: vi.fn().mockResolvedValue({ added: [], removed: [] }),
  setTemplateServicePartAllowedRoles: vi.fn().mockResolvedValue({ added: [], removed: [] }),
}))

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  AuditAction: {
    PartAllowedRolesChanged: 'part.allowed_roles.changed',
    ServicePartAllowedRolesChanged: 'service_role.allowed_roles.changed',
    TemplateUpdated: 'event_template.updated',
    TemplateDeleted: 'event_template.deleted',
  },
}))

const { getTemplates, getTemplateById, updateTemplate, setTemplateResponsible, removeTemplateResponsible } =
  await import('./event-templates.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const allowedRoles = await import('~/features/events/server/allowed-roles.server')
const auditModule = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.templateServicePart.aggregate).mockResolvedValue({ _max: { order: null } } as never)
  vi.mocked(allowedRoles.setTemplatePartAllowedRoles).mockResolvedValue({ added: [], removed: [] })
  vi.mocked(allowedRoles.setTemplateServicePartAllowedRoles).mockResolvedValue({ added: [], removed: [] })
})

describe('getTemplates', () => {
  it('returns all templates for a congregation', async () => {
    const fakeTemplates = [{ id: 1, name: 'Réunion de semaine' }]
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue(fakeTemplates as never)

    const result = await getTemplates(db, 1)
    expect(result).toEqual(fakeTemplates)
  })

  it("pulls the responsible's role so the list can render its name", async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([] as never)

    await getTemplates(db, 1)

    const args = vi.mocked(db.eventTemplate.findMany).mock.calls[0][0]
    expect(args?.include?.responsibles).toMatchObject({
      include: { role: { select: { id: true, key: true, name: true } } },
    })
  })
})

describe('getTemplateById', () => {
  it('returns a template with parts and service roles', async () => {
    const fakeTemplate = { id: 1, name: 'Réunion de semaine', parts: [], serviceParts: [] }
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(fakeTemplate as never)

    const result = await getTemplateById(db, 1, 1)
    expect(result).toEqual(fakeTemplate)
  })

  it('returns null when template not found', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)

    const result = await getTemplateById(db, 999, 1)
    expect(result).toBeNull()
  })

  it("pulls the responsible's role so the view can render its name", async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)

    await getTemplateById(db, 1, 1)

    const args = vi.mocked(db.eventTemplate.findFirst).mock.calls[0][0]
    expect(args?.include?.responsibles).toMatchObject({
      include: { role: { select: { id: true, key: true, name: true } } },
    })
  })
})

describe('updateTemplate', () => {
  it('updates template name', async () => {
    const updated = { id: 1, name: 'Updated Name' }
    vi.mocked(db.eventTemplate.update).mockResolvedValue(updated as never)

    const result = await updateTemplate(db, 1, { name: 'Updated Name' }, 1, 9)
    expect(result).toEqual(updated)
  })

  it('updates the colour when provided', async () => {
    vi.mocked(db.eventTemplate.update).mockResolvedValue({ id: 1 } as never)

    await updateTemplate(db, 1, { name: 'Réunion', color: '#ff00aa' }, 1, 9)

    const call = vi.mocked(db.eventTemplate.update).mock.calls[0]
    expect((call[0] as { data: { color: string } }).data.color).toBe('#ff00aa')
  })

  it('saves how the template counts in attendance', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ key: 'midweek-meeting', attendanceKind: 'none' } as never)
    vi.mocked(db.eventTemplate.update).mockResolvedValue({ id: 1 } as never)

    await updateTemplate(db, 1, { attendanceKind: 'midweek' }, 1, 9)

    const call = vi.mocked(db.eventTemplate.update).mock.calls[0]
    expect((call[0] as { data: Record<string, unknown> }).data).toEqual({ attendanceKind: 'midweek' })
  })

  // Recurrence has always meant « has a weekday »; the column used to keep its create-time value forever.
  it('keeps isRecurring in step with the weekday', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      key: 'study',
      weekDay: null,
      isRecurring: false,
    } as never)
    vi.mocked(db.eventTemplate.update).mockResolvedValue({ id: 1 } as never)
    await updateTemplate(db, 1, { weekDay: 3 }, 1, 9)
    expect((vi.mocked(db.eventTemplate.update).mock.calls[0][0] as { data: Record<string, unknown> }).data).toEqual({
      weekDay: 3,
      isRecurring: true,
    })

    vi.mocked(db.eventTemplate.update).mockClear()
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ key: 'study', weekDay: 3, isRecurring: true } as never)
    await updateTemplate(db, 1, { weekDay: null }, 1, 9)
    expect((vi.mocked(db.eventTemplate.update).mock.calls[0][0] as { data: Record<string, unknown> }).data).toEqual({
      weekDay: null,
      isRecurring: false,
    })
  })

  it('never lets a system template count attendance', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ key: 'freeform', attendanceKind: 'none' } as never)

    const result = await updateTemplate(db, 1, { attendanceKind: 'weekend' }, 1, 9)

    expect(result).toBeNull()
    expect(db.eventTemplate.update).not.toHaveBeenCalled()
  })

  // System templates back domain concepts — createFreeformEvent looks them up
  // by `key`, so renaming or restructuring them from the settings UI would
  // silently break the feature. The server enforces that even if the form
  // POSTs a full payload, only the colour lands on the row.
  it('only writes the colour on system templates', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ key: 'freeform' } as never)
    vi.mocked(db.eventTemplate.update).mockResolvedValue({ id: 1 } as never)

    await updateTemplate(
      db,
      1,
      { name: 'Nope', color: '#abcdef', weekDay: 3, startTime: '20:00', endTime: '22:00' },
      1,
      9,
    )

    const call = vi.mocked(db.eventTemplate.update).mock.calls[0]
    const written = (call[0] as { data: Record<string, unknown> }).data
    expect(written).toEqual({ color: '#abcdef' })
  })

  it('skips the update entirely on system templates when nothing but ignored fields is passed', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ key: 'freeform' } as never)

    await updateTemplate(db, 1, { name: 'Nope', weekDay: 3, startTime: '20:00', endTime: '22:00' }, 1, 9)

    expect(db.eventTemplate.update).not.toHaveBeenCalled()
    expect(auditModule.audit).not.toHaveBeenCalled()
  })

  it('writes nothing when the fields hold what is saved', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      key: 'midweek',
      name: 'Réunion',
      color: '#ff00aa',
    } as never)

    const result = await updateTemplate(db, 1, { name: 'Réunion', color: '#ff00aa' }, 1, 9)

    expect(result).toBeNull()
    expect(db.eventTemplate.update).not.toHaveBeenCalled()
    expect(auditModule.audit).not.toHaveBeenCalled()
  })

  it('says in the audit log which of the template’s fields changed', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      key: 'midweek',
      name: 'Réunion de semaine',
      color: '#ff00aa',
      startTime: '19:00',
    } as never)
    vi.mocked(db.eventTemplate.update).mockResolvedValue({ id: 1 } as never)

    await updateTemplate(db, 1, { name: 'Réunion', color: '#ff00aa', startTime: '19:30' }, 1, 9)

    expect(vi.mocked(db.eventTemplate.update).mock.calls[0][0].data).toEqual({ name: 'Réunion', startTime: '19:30' })

    expect(auditModule.audit).toHaveBeenCalledWith({
      action: 'event_template.updated',
      congregationId: 1,
      actorId: 9,
      entityType: 'EventTemplate',
      entityId: 1,
      metadata: { fields: ['name', 'startTime'] },
    })
  })
})

describe('setTemplateResponsible', () => {
  it('upserts a responsible role for a template', async () => {
    const responsible = { id: 1, templateId: 1, roleId: 5 }
    vi.mocked(db.templateResponsible.upsert).mockResolvedValue(responsible as never)

    const result = await setTemplateResponsible(db, 1, 5, 1)
    expect(result).toEqual(responsible)
  })

  it('defaults to the whole-event delegation', async () => {
    vi.mocked(db.templateResponsible.upsert).mockResolvedValue({} as never)

    await setTemplateResponsible(db, 1, 5, 1)

    const call = vi.mocked(db.templateResponsible.upsert).mock.calls[0][0]
    expect(call.where.templateId_scope_congregationId).toEqual({ templateId: 1, scope: 'programme', congregationId: 1 })
    expect(call.create).toMatchObject({ scope: 'programme' })
  })

  // The compound key is what keeps the two delegations independent: writing the
  // service one must upsert its own row, not overwrite the programme role.
  it('keys the upsert on the scope so each delegation owns its own row', async () => {
    vi.mocked(db.templateResponsible.upsert).mockResolvedValue({} as never)

    await setTemplateResponsible(db, 1, 9, 1, ResponsibilityScope.Service)

    const call = vi.mocked(db.templateResponsible.upsert).mock.calls[0][0]
    expect(call.where.templateId_scope_congregationId).toEqual({ templateId: 1, scope: 'service', congregationId: 1 })
    expect(call.create).toMatchObject({ roleId: 9, scope: 'service' })
  })
})

describe('removeTemplateResponsible', () => {
  it('removes the responsible from a template', async () => {
    vi.mocked(db.templateResponsible.deleteMany).mockResolvedValue({ count: 1 } as never)

    const result = await removeTemplateResponsible(db, 1, 1)
    expect(result).toEqual({ count: 1 })
  })

  // Clearing one picker on the settings form must not blank the other.
  it('deletes only the named scope', async () => {
    vi.mocked(db.templateResponsible.deleteMany).mockResolvedValue({ count: 1 } as never)

    await removeTemplateResponsible(db, 1, 1, ResponsibilityScope.Service)

    expect(db.templateResponsible.deleteMany).toHaveBeenCalledWith({
      where: { templateId: 1, scope: 'service', congregationId: 1 },
    })
  })
})
