import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventTemplate: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    event: { count: vi.fn() },
    templatePart: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    templateServicePart: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    templateResponsible: { upsert: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
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
  },
}))

const {
  getTemplates,
  getTemplateById,
  updateTemplate,
  upsertTemplatePart,
  deleteTemplatePart,
  upsertTemplateServicePart,
  deleteTemplateServicePart,
  setTemplateResponsible,
  removeTemplateResponsible,
  isTemplateResponsible,
  deleteTemplate,
} = await import('./event-templates.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const allowedRoles = await import('~/features/events/server/allowed-roles.server')
const auditModule = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
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

  it("pulls the responsible's linked member name so the list can render it", async () => {
    vi.mocked(db.eventTemplate.findMany).mockResolvedValue([] as never)

    await getTemplates(db, 1)

    const args = vi.mocked(db.eventTemplate.findMany).mock.calls[0][0]
    expect(args?.include?.responsibles).toMatchObject({
      include: { user: { include: { member: { select: { firstname: true, lastname: true } } } } },
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

  it("pulls the responsible's linked member name so the view can render it", async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)

    await getTemplateById(db, 1, 1)

    const args = vi.mocked(db.eventTemplate.findFirst).mock.calls[0][0]
    expect(args?.include?.responsibles).toMatchObject({
      include: { user: { include: { member: { select: { firstname: true, lastname: true } } } } },
    })
  })
})

describe('updateTemplate', () => {
  it('updates template name', async () => {
    const updated = { id: 1, name: 'Updated Name' }
    vi.mocked(db.eventTemplate.update).mockResolvedValue(updated as never)

    const result = await updateTemplate(db, 1, { name: 'Updated Name' }, 1)
    expect(result).toEqual(updated)
  })

  it('updates the colour when provided', async () => {
    vi.mocked(db.eventTemplate.update).mockResolvedValue({ id: 1 } as never)

    await updateTemplate(db, 1, { name: 'Réunion', color: '#ff00aa' }, 1)

    const call = vi.mocked(db.eventTemplate.update).mock.calls[0]
    expect((call[0] as { data: { color: string } }).data.color).toBe('#ff00aa')
  })

  // System templates back domain concepts — the day-off writer looks them up
  // by `key`, so renaming or restructuring them from the settings UI would
  // silently break the feature. The server enforces that even if the form
  // POSTs a full payload, only the colour lands on the row.
  it('only writes the colour on system templates', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ key: 'day-off' } as never)
    vi.mocked(db.eventTemplate.update).mockResolvedValue({ id: 1 } as never)

    await updateTemplate(db, 1, { name: 'Nope', color: '#abcdef', weekDay: 3, startTime: '20:00', endTime: '22:00' }, 1)

    const call = vi.mocked(db.eventTemplate.update).mock.calls[0]
    const written = (call[0] as { data: Record<string, unknown> }).data
    expect(written).toEqual({ color: '#abcdef' })
  })

  it('skips the update entirely on system templates when nothing but ignored fields is passed', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({ key: 'freeform' } as never)

    await updateTemplate(db, 1, { name: 'Nope', weekDay: 3, startTime: '20:00', endTime: '22:00' }, 1)

    expect(db.eventTemplate.update).not.toHaveBeenCalled()
  })
})

describe('upsertTemplatePart', () => {
  it('creates a new part when no id provided', async () => {
    const newPart = { id: 10, name: 'New Part' }
    vi.mocked(db.templatePart.create).mockResolvedValue(newPart as never)

    const result = await upsertTemplatePart(
      db,
      1,
      {
        name: 'New Part',
        section: '',
        track: '',
        order: 1,
        durationMin: 10,
        allowExternalSpeaker: false,
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
      },
      1,
      99,
    )
    expect(result).toEqual(newPart)
  })

  it('stores the chosen preset on a new part', async () => {
    vi.mocked(db.templatePart.create).mockResolvedValue({ id: 10 } as never)

    await upsertTemplatePart(
      db,
      1,
      {
        name: 'Lecture de la Bible',
        section: '',
        track: '',
        order: 1,
        durationMin: 4,
        allowExternalSpeaker: false,
        presetId: 4242,
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
      },
      1,
      99,
    )

    expect(vi.mocked(db.templatePart.create).mock.calls[0][0].data.presetId).toBe(4242)
  })

  it('clears the preset on an existing part when none is chosen', async () => {
    vi.mocked(db.templatePart.update).mockResolvedValue({ id: 5 } as never)

    await upsertTemplatePart(
      db,
      1,
      {
        id: 5,
        name: '1re partie',
        section: 'Appliquons-nous au ministère',
        track: '',
        order: 5,
        durationMin: null,
        allowExternalSpeaker: false,
        presetId: null,
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
      },
      1,
      99,
    )

    expect(vi.mocked(db.templatePart.update).mock.calls[0][0].data.presetId).toBeNull()
  })

  it('updates an existing part when id is provided', async () => {
    const updatedPart = { id: 5, name: 'Updated Part' }
    vi.mocked(db.templatePart.update).mockResolvedValue(updatedPart as never)

    const result = await upsertTemplatePart(
      db,
      1,
      {
        id: 5,
        name: 'Updated Part',
        section: '',
        track: '',
        order: 1,
        durationMin: 10,
        allowExternalSpeaker: false,
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
      },
      1,
      99,
    )
    expect(result).toEqual(updatedPart)
  })
})

describe('deleteTemplatePart', () => {
  it('deletes a part', async () => {
    const deleted = { id: 5 }
    vi.mocked(db.templatePart.delete).mockResolvedValue(deleted as never)

    const result = await deleteTemplatePart(db, 5, 1)
    expect(result).toEqual(deleted)
  })
})

describe('upsertTemplateServicePart', () => {
  it('creates a new service role when no id provided', async () => {
    const newRole = { id: 10, name: 'Sono', key: 'sono' }
    vi.mocked(db.templateServicePart.create).mockResolvedValue(newRole as never)

    const result = await upsertTemplateServicePart(db, 1, { name: 'Sono', key: 'sono', allowedRoleIds: [] }, 1, 99)
    expect(result).toEqual(newRole)
  })

  it('updates an existing service role when id is provided', async () => {
    const updatedRole = { id: 3, name: 'Updated' }
    vi.mocked(db.templateServicePart.update).mockResolvedValue(updatedRole as never)

    const result = await upsertTemplateServicePart(
      db,
      1,
      { id: 3, name: 'Updated', key: 'updated', allowedRoleIds: [] },
      1,
      99,
    )
    expect(result).toEqual(updatedRole)
  })
})

describe('deleteTemplateServicePart', () => {
  it('deletes a service role', async () => {
    const deleted = { id: 3 }
    vi.mocked(db.templateServicePart.delete).mockResolvedValue(deleted as never)

    const result = await deleteTemplateServicePart(db, 3, 1)
    expect(result).toEqual(deleted)
  })
})

describe('setTemplateResponsible', () => {
  it('upserts a responsible user for a template', async () => {
    const responsible = { id: 1, templateId: 1, userId: 5 }
    vi.mocked(db.templateResponsible.upsert).mockResolvedValue(responsible as never)

    const result = await setTemplateResponsible(db, 1, 5, 1)
    expect(result).toEqual(responsible)
  })
})

describe('removeTemplateResponsible', () => {
  it('removes the responsible from a template', async () => {
    vi.mocked(db.templateResponsible.deleteMany).mockResolvedValue({ count: 1 } as never)

    const result = await removeTemplateResponsible(db, 1, 1)
    expect(result).toEqual({ count: 1 })
  })
})

describe('isTemplateResponsible', () => {
  it('returns the record when user is responsible', async () => {
    const record = { id: 1, templateId: 1, userId: 5 }
    vi.mocked(db.templateResponsible.findFirst).mockResolvedValue(record as never)

    const result = await isTemplateResponsible(db, 1, 5, 1)
    expect(result).toEqual(record)
  })

  it('returns null when user is not responsible', async () => {
    vi.mocked(db.templateResponsible.findFirst).mockResolvedValue(null as never)

    const result = await isTemplateResponsible(db, 1, 99, 1)
    expect(result).toBeNull()
  })
})

describe('upsertTemplatePart role labels', () => {
  it('passes speakerLabel and readerLabel through to the create data (Layer 5)', async () => {
    vi.mocked(db.templatePart.create).mockResolvedValue({ id: 42 } as never)

    await upsertTemplatePart(
      db,
      1,
      {
        name: 'Bible reading',
        section: '',
        track: '',
        order: 1,
        durationMin: 5,
        allowExternalSpeaker: false,
        speakerLabel: 'STUDENT-SENTINEL',
        readerLabel: null,
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
      },
      7,
      99,
    )

    expect(vi.mocked(db.templatePart.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({ speakerLabel: 'STUDENT-SENTINEL', readerLabel: null }),
    })
  })

  it('passes speakerLabel and readerLabel through to the update data (Layer 5)', async () => {
    vi.mocked(db.templatePart.update).mockResolvedValue({ id: 42 } as never)

    await upsertTemplatePart(
      db,
      1,
      {
        id: 42,
        name: 'Return visit',
        section: '',
        track: '',
        order: 1,
        durationMin: 10,
        allowExternalSpeaker: false,
        speakerLabel: 'STUDENT-SENTINEL',
        readerLabel: 'HOUSEHOLDER-SENTINEL',
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
      },
      7,
      99,
    )

    expect(vi.mocked(db.templatePart.update)).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 42, congregationId: 7 } },
      data: expect.objectContaining({ speakerLabel: 'STUDENT-SENTINEL', readerLabel: 'HOUSEHOLDER-SENTINEL' }),
    })
  })
})

describe('upsertTemplatePart audit firing', () => {
  it('fires PartAllowedRolesChanged audit when role lists change', async () => {
    vi.mocked(db.templatePart.create).mockResolvedValue({ id: 50 } as never)
    vi.mocked(allowedRoles.setTemplatePartAllowedRoles).mockResolvedValueOnce({ added: [10], removed: [] })
    vi.mocked(allowedRoles.setTemplatePartAllowedRoles).mockResolvedValueOnce({ added: [], removed: [] })

    await upsertTemplatePart(
      db,
      1,
      {
        name: 'Discours',
        section: '',
        track: '',
        order: 1,
        durationMin: 30,
        allowExternalSpeaker: false,
        allowedSpeakerRoleIds: [10],
        allowedReaderRoleIds: [],
      },
      1,
      99,
    )

    expect(vi.mocked(auditModule.audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'part.allowed_roles.changed',
        entityType: 'TemplatePart',
        entityId: 50,
        actorId: 99,
      }),
    )
  })

  it('does not fire audit when role lists do not change', async () => {
    vi.mocked(db.templatePart.create).mockResolvedValue({ id: 50 } as never)
    vi.mocked(allowedRoles.setTemplatePartAllowedRoles).mockResolvedValue({ added: [], removed: [] })

    await upsertTemplatePart(
      db,
      1,
      {
        name: 'Discours',
        section: '',
        track: '',
        order: 1,
        durationMin: 30,
        allowExternalSpeaker: false,
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
      },
      1,
      99,
    )

    expect(vi.mocked(auditModule.audit)).not.toHaveBeenCalled()
  })
})

describe('upsertTemplateServicePart audit firing', () => {
  it('fires ServicePartAllowedRolesChanged audit when role list changes', async () => {
    vi.mocked(db.templateServicePart.create).mockResolvedValue({ id: 60 } as never)
    vi.mocked(allowedRoles.setTemplateServicePartAllowedRoles).mockResolvedValueOnce({ added: [11], removed: [] })

    await upsertTemplateServicePart(db, 1, { name: 'Son', key: 'sono', allowedRoleIds: [11] }, 1, 99)

    expect(vi.mocked(auditModule.audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_role.allowed_roles.changed',
        entityType: 'TemplateServicePart',
        entityId: 60,
        actorId: 99,
      }),
    )
  })

  it('does not fire audit when role list is unchanged', async () => {
    vi.mocked(db.templateServicePart.create).mockResolvedValue({ id: 60 } as never)
    vi.mocked(allowedRoles.setTemplateServicePartAllowedRoles).mockResolvedValue({ added: [], removed: [] })

    await upsertTemplateServicePart(db, 1, { name: 'Son', key: 'sono', allowedRoleIds: [] }, 1, 99)

    expect(vi.mocked(auditModule.audit)).not.toHaveBeenCalled()
  })
})

describe('deleteTemplate', () => {
  it('deletes a custom template with no linked events and returns its name', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      key: 'midweek',
      name: 'Réunion de semaine',
      _count: { events: 0 },
    } as never)
    vi.mocked(db.eventTemplate.delete).mockResolvedValue({ id: 7 } as never)

    const result = await deleteTemplate(db, 7, 1)

    expect(result).toEqual({ ok: true, name: 'Réunion de semaine' })
    expect(db.eventTemplate.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 7, congregationId: 1 } },
    })
  })

  it('returns not-found and never deletes when the template does not exist', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)

    const result = await deleteTemplate(db, 999, 1)

    expect(result).toEqual({ ok: false, reason: 'not-found' })
    expect(db.eventTemplate.delete).not.toHaveBeenCalled()
  })

  // System templates (day-off, freeform) are looked up by key at runtime; the
  // server refuses to remove them even if a stale form POSTs the intent.
  it('refuses to delete a system template', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      key: 'day-off',
      name: 'Jour de congé',
      _count: { events: 0 },
    } as never)

    const result = await deleteTemplate(db, 3, 1)

    expect(result).toEqual({ ok: false, reason: 'system' })
    expect(db.eventTemplate.delete).not.toHaveBeenCalled()
  })

  // Event.templateId is ON DELETE SET NULL: removing an in-use template would
  // orphan its events (templateId → NULL) and drop them from key-filtered
  // queries. The writer blocks it and surfaces the count instead.
  it('refuses to delete a template still linked to events and reports the count', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue({
      key: 'midweek',
      name: 'Réunion de semaine',
      _count: { events: 4 },
    } as never)

    const result = await deleteTemplate(db, 7, 1)

    expect(result).toEqual({ ok: false, reason: 'in-use', eventCount: 4 })
    expect(db.eventTemplate.delete).not.toHaveBeenCalled()
  })

  it('scopes the lookup to the given congregation', async () => {
    vi.mocked(db.eventTemplate.findFirst).mockResolvedValue(null as never)

    await deleteTemplate(db, 7, 42)

    const args = vi.mocked(db.eventTemplate.findFirst).mock.calls[0][0]
    expect(args?.where).toEqual({ id: 7, congregationId: 42 })
  })
})
