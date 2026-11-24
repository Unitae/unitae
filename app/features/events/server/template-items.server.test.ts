import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    templatePart: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    templateServicePart: { aggregate: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
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

const { upsertTemplatePart, deleteTemplatePart, upsertTemplateServicePart, deleteTemplateServicePart } = await import(
  './template-items.server'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const allowedRoles = await import('~/features/events/server/allowed-roles.server')
const auditModule = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.templateServicePart.aggregate).mockResolvedValue({ _max: { order: null } } as never)
  vi.mocked(allowedRoles.setTemplatePartAllowedRoles).mockResolvedValue({ added: [], removed: [] })
  vi.mocked(allowedRoles.setTemplateServicePartAllowedRoles).mockResolvedValue({ added: [], removed: [] })
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

  it('puts a new service after the template’s last one', async () => {
    vi.mocked(db.templateServicePart.aggregate).mockResolvedValue({ _max: { order: 10 } } as never)
    vi.mocked(db.templateServicePart.create).mockResolvedValue({ id: 11 } as never)

    await upsertTemplateServicePart(db, 4, { name: 'Accueil', key: 'accueil', allowedRoleIds: [] }, 1, 99)

    expect(db.templateServicePart.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { templateId: 4, congregationId: 1 } }),
    )
    expect(db.templateServicePart.create).toHaveBeenCalledWith({
      data: { name: 'Accueil', key: 'accueil', order: 15, templateId: 4, congregationId: 1 },
    })
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
