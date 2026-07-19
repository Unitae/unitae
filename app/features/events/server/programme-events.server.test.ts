import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn() },
}))

vi.mock('~/features/events/server/allowed-roles.server', () => ({
  setPartAssignmentAllowedRoles: vi.fn().mockResolvedValue({ added: [], removed: [] }),
  setServiceRoleAssignmentAllowedRoles: vi.fn().mockResolvedValue({ added: [], removed: [] }),
}))

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {
    PartAllowedRolesChanged: 'part.allowed_roles.changed',
    ServiceRoleAllowedRolesChanged: 'service_role.allowed_roles.changed',
    EventDeleted: 'event.deleted',
    EventUpdated: 'event.updated',
  },
}))

const {
  createFreeformEvent,
  deleteEvent,
  updateEvent,
  addPartAssignment,
  deletePartAssignment,
  addServiceRoleAssignment,
  deleteServiceRoleAssignment,
  applyTemplateToEvent,
  bulkDeleteEvents,
} = await import('./programme-events.server')

const mockDb = {
  event: {
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  programmePartAssignment: {
    create: vi.fn(),
    delete: vi.fn(),
  },
  programmeServiceRoleAssignment: {
    create: vi.fn(),
    delete: vi.fn(),
  },
  programmePartAssignmentAllowedRole: {
    createMany: vi.fn(),
  },
  programmeServiceRoleAssignmentAllowedRole: {
    createMany: vi.fn(),
  },
  programmeTemplate: {
    findFirst: vi.fn(),
  },
}

const allowedRoles = await import('~/features/events/server/allowed-roles.server')
const auditModule = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(allowedRoles.setPartAssignmentAllowedRoles).mockResolvedValue({ added: [], removed: [] })
  vi.mocked(allowedRoles.setServiceRoleAssignmentAllowedRoles).mockResolvedValue({ added: [], removed: [] })
})

describe('createFreeformEvent', () => {
  it('creates an event connected to the freeform system template', async () => {
    const data = {
      name: 'Reunion',
      startDate: new Date('2026-04-20'),
      endDate: new Date('2026-04-20'),
      createdById: 1,
      congregationId: 10,
    }
    mockDb.programmeTemplate.findFirst.mockResolvedValue({ id: 99, key: 'freeform' })
    const expected = { id: 1, ...data }
    mockDb.event.create.mockResolvedValue(expected)

    const result = await createFreeformEvent(mockDb as never, data)

    expect(result).toEqual(expected)
    expect(mockDb.programmeTemplate.findFirst).toHaveBeenCalledWith({
      where: { key: 'freeform', congregationId: 10 },
    })
    expect(mockDb.event.create).toHaveBeenCalledWith({
      data: {
        ...data,
        templateId: 99,
      },
    })
  })

  // Fail loudly when the freeform template is missing rather than writing a
  // templateless event that would silently disappear from every
  // `template.key`-filtered query.
  it('throws NotFoundError when the freeform system template is missing', async () => {
    const data = {
      name: 'Reunion',
      startDate: new Date('2026-04-20'),
      endDate: new Date('2026-04-20'),
      createdById: 1,
      congregationId: 10,
    }
    mockDb.programmeTemplate.findFirst.mockResolvedValue(null)

    await expect(createFreeformEvent(mockDb as never, data)).rejects.toThrow('Freeform template')
    expect(mockDb.event.create).not.toHaveBeenCalled()
  })
})

describe('bulkDeleteEvents', () => {
  it('deletes every event in a single scoped deleteMany', async () => {
    mockDb.event.deleteMany.mockResolvedValue({ count: 3 })

    await bulkDeleteEvents(mockDb as never, [1, 2, 3], 42, 7)

    expect(mockDb.event.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2, 3] }, congregationId: 42 },
    })
  })

  // Governance: the same auditInTransaction pattern release/unrelease use.
  // Fire-and-forget audit (unscopedDb) would leave phantom rows if the
  // deleteMany rolls back.
  it('writes an auditInTransaction EventDeleted row for every deleted event', async () => {
    mockDb.event.deleteMany.mockResolvedValue({ count: 2 })

    await bulkDeleteEvents(mockDb as never, [10, 11], 42, 7)

    expect(vi.mocked(auditModule.auditInTransaction)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(auditModule.auditInTransaction)).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        action: 'event.deleted',
        congregationId: 42,
        actorId: 7,
        entityType: 'Event',
        entityId: 10,
      }),
    )
    expect(vi.mocked(auditModule.auditInTransaction)).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        action: 'event.deleted',
        congregationId: 42,
        actorId: 7,
        entityType: 'Event',
        entityId: 11,
      }),
    )
  })

  it('does not fire audit or deleteMany when the id list is empty', async () => {
    await bulkDeleteEvents(mockDb as never, [], 42, 7)

    expect(mockDb.event.deleteMany).not.toHaveBeenCalled()
    expect(vi.mocked(auditModule.auditInTransaction)).not.toHaveBeenCalled()
  })

  it('returns the Prisma delete count so callers can log a truthful number', async () => {
    mockDb.event.deleteMany.mockResolvedValue({ count: 2 })

    const result = await bulkDeleteEvents(mockDb as never, [10, 11, 12], 42, 7)

    // Truthful count from Prisma (12 didn't exist so only 2 were deleted).
    expect(result).toEqual({ count: 2 })
  })
})

describe('deleteEvent', () => {
  it('deletes an event using compound key', async () => {
    const expected = { id: 3 }
    mockDb.event.delete.mockResolvedValue(expected)

    const result = await deleteEvent(mockDb as never, 3, 10)

    expect(result).toEqual(expected)
    expect(mockDb.event.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 3, congregationId: 10 } },
    })
  })
})

describe('updateEvent', () => {
  it('updates an event with the typed field subset using compound key', async () => {
    const data = { name: 'Assemblee', startDate: new Date('2026-05-10T18:00:00Z') }
    const expected = { id: 2, ...data }
    mockDb.event.update.mockResolvedValue(expected)

    const result = await updateEvent(mockDb as never, 2, 10, data, 99)

    expect(result).toEqual(expected)
    expect(mockDb.event.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 2, congregationId: 10 } },
      data,
    })
  })

  it('accepts a partial subset — missing optional fields are simply not passed through', async () => {
    // Prisma treats `undefined` in the data object as "do not touch this
    // column", so a partial update with just `name` must not clobber
    // startDate/endDate. Assert the exact data shape we forward.
    mockDb.event.update.mockResolvedValue({ id: 2, name: 'Just the name' })

    await updateEvent(mockDb as never, 2, 10, { name: 'Just the name' }, 99)

    expect(mockDb.event.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 2, congregationId: 10 } },
      data: { name: 'Just the name' },
    })
  })

  it('writes an EventUpdated audit row with the changed field names as metadata', async () => {
    const startDate = new Date('2026-05-10T18:00:00Z')
    mockDb.event.update.mockResolvedValue({ id: 2, name: 'X', startDate })

    await updateEvent(mockDb as never, 2, 10, { name: 'X', startDate }, 99)

    // Field NAMES only (not values) — enough for forensics ("who touched
    // startDate on Aug 3") without ballooning audit-log volume.
    expect(vi.mocked(auditModule.audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'event.updated',
        congregationId: 10,
        actorId: 99,
        entityType: 'Event',
        entityId: 2,
        metadata: { fields: ['name', 'startDate'] },
      }),
    )
  })
})

describe('addPartAssignment', () => {
  it('creates a part assignment', async () => {
    const data = {
      eventId: 1,
      name: 'Discours',
      section: 'main',
      track: 'A',
      order: 1,
      durationMin: 30,
      allowExternalSpeaker: false,
      allowedSpeakerRoleIds: [],
      allowedReaderRoleIds: [],
      congregationId: 10,
    }
    const { allowedSpeakerRoleIds: _s, allowedReaderRoleIds: _r, ...createData } = data
    const expected = { id: 1, ...createData }
    mockDb.programmePartAssignment.create.mockResolvedValue(expected)

    const result = await addPartAssignment(mockDb as never, data, 99)

    expect(result).toEqual(expected)
    expect(mockDb.programmePartAssignment.create).toHaveBeenCalledWith({ data: createData })
  })
})

describe('deletePartAssignment', () => {
  it('deletes a part assignment using compound key', async () => {
    mockDb.programmePartAssignment.delete.mockResolvedValue({ id: 5 })

    const result = await deletePartAssignment(mockDb as never, 5, 10)

    expect(result).toEqual({ id: 5 })
    expect(mockDb.programmePartAssignment.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 5, congregationId: 10 } },
    })
  })
})

describe('addServiceRoleAssignment', () => {
  it('creates a service role assignment', async () => {
    const data = { eventId: 1, name: 'Son', allowedRoleIds: [], congregationId: 10 }
    const { allowedRoleIds: _a, ...createData } = data
    const expected = { id: 1, ...createData }
    mockDb.programmeServiceRoleAssignment.create.mockResolvedValue(expected)

    const result = await addServiceRoleAssignment(mockDb as never, data, 99)

    expect(result).toEqual(expected)
    expect(mockDb.programmeServiceRoleAssignment.create).toHaveBeenCalledWith({ data: createData })
  })
})

describe('deleteServiceRoleAssignment', () => {
  it('deletes a service role assignment using compound key', async () => {
    mockDb.programmeServiceRoleAssignment.delete.mockResolvedValue({ id: 8 })

    const result = await deleteServiceRoleAssignment(mockDb as never, 8, 10)

    expect(result).toEqual({ id: 8 })
    expect(mockDb.programmeServiceRoleAssignment.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 8, congregationId: 10 } },
    })
  })
})

describe('applyTemplateToEvent', () => {
  it('returns null when template is not found', async () => {
    mockDb.programmeTemplate.findFirst.mockResolvedValue(null)

    const result = await applyTemplateToEvent(mockDb as never, 1, 99, 10, 1)

    expect(result).toBeNull()
    expect(mockDb.event.update).not.toHaveBeenCalled()
  })

  it('applies template parts and service roles to the event', async () => {
    const template = {
      id: 5,
      name: 'Reunion vie',
      parts: [
        {
          id: 10,
          name: 'Cantique',
          section: 'intro',
          track: 'A',
          order: 1,
          durationMin: 5,
          speakerLabel: null,
          readerLabel: null,
          allowedRoles: [],
        },
        {
          id: 11,
          name: 'Discours',
          section: 'main',
          track: 'A',
          order: 2,
          durationMin: 30,
          speakerLabel: null,
          readerLabel: null,
          allowedRoles: [],
        },
      ],
      serviceRoles: [{ id: 20, name: 'Son', allowedRoles: [] }],
    }
    mockDb.programmeTemplate.findFirst.mockResolvedValue(template)
    mockDb.event.update.mockResolvedValue({})
    mockDb.programmePartAssignment.create.mockResolvedValue({ id: 999 })
    mockDb.programmeServiceRoleAssignment.create.mockResolvedValue({ id: 998 })

    const result = await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    expect(result).toEqual(template)
    expect(mockDb.event.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 1, congregationId: 10 } },
      data: { templateId: 5 },
    })
    expect(mockDb.programmePartAssignment.create).toHaveBeenCalledTimes(2)
    expect(mockDb.programmePartAssignment.create).toHaveBeenCalledWith({
      data: {
        eventId: 1,
        partId: 10,
        name: 'Cantique',
        section: 'intro',
        track: 'A',
        order: 1,
        durationMin: 5,
        speakerLabel: null,
        readerLabel: null,
        congregationId: 10,
      },
    })
    expect(mockDb.programmeServiceRoleAssignment.create).toHaveBeenCalledWith({
      data: { eventId: 1, serviceRoleId: 20, name: 'Son', congregationId: 10 },
    })
  })

  // Sentinel test: proves the two label fields are threaded from the template
  // and not fabricated by the caller. A regression that hardcodes null would
  // pass the existing shape assertion above (both fields are null there) but
  // fails this one.
  it('copies speakerLabel and readerLabel from template parts to assignments (Layer 4)', async () => {
    const template = {
      id: 5,
      name: 'Reunion',
      parts: [
        {
          id: 10,
          name: 'Bible reading',
          section: 'main',
          track: 'A',
          order: 1,
          durationMin: 5,
          speakerLabel: 'STUDENT-SENTINEL',
          readerLabel: null,
          allowedRoles: [],
        },
        {
          id: 11,
          name: 'Return visit',
          section: 'main',
          track: 'A',
          order: 2,
          durationMin: 10,
          speakerLabel: 'STUDENT-SENTINEL',
          readerLabel: 'HOUSEHOLDER-SENTINEL',
          allowedRoles: [],
        },
      ],
      serviceRoles: [],
    }
    mockDb.programmeTemplate.findFirst.mockResolvedValue(template)
    mockDb.event.update.mockResolvedValue({})
    mockDb.programmePartAssignment.create.mockResolvedValue({ id: 999 })

    await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    const calls = mockDb.programmePartAssignment.create.mock.calls
    expect(calls.length).toBe(2)
    expect(calls[0][0].data).toMatchObject({ speakerLabel: 'STUDENT-SENTINEL', readerLabel: null })
    expect(calls[1][0].data).toMatchObject({
      speakerLabel: 'STUDENT-SENTINEL',
      readerLabel: 'HOUSEHOLDER-SENTINEL',
    })
  })

  it('copies non-empty allowed-role lists from template parts and service roles to assignments', async () => {
    const template = {
      id: 5,
      name: 'Reunion',
      parts: [
        {
          id: 10,
          name: 'Discours',
          section: '',
          track: '',
          order: 1,
          durationMin: 30,
          speakerLabel: null,
          readerLabel: null,
          allowedRoles: [
            { roleId: 100, asKind: 'speaker' },
            { roleId: 101, asKind: 'speaker' },
            { roleId: 200, asKind: 'reader' },
          ],
        },
      ],
      serviceRoles: [{ id: 20, name: 'Son', allowedRoles: [{ roleId: 300 }, { roleId: 301 }] }],
    }
    mockDb.programmeTemplate.findFirst.mockResolvedValue(template)
    mockDb.event.update.mockResolvedValue({})
    mockDb.programmePartAssignment.create.mockResolvedValue({ id: 555 })
    mockDb.programmeServiceRoleAssignment.create.mockResolvedValue({ id: 666 })
    mockDb.programmePartAssignmentAllowedRole.createMany.mockResolvedValue({ count: 3 })
    mockDb.programmeServiceRoleAssignmentAllowedRole.createMany.mockResolvedValue({ count: 2 })

    await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    expect(mockDb.programmePartAssignmentAllowedRole.createMany).toHaveBeenCalledWith({
      data: [
        { assignmentId: 555, roleId: 100, asKind: 'speaker', congregationId: 10 },
        { assignmentId: 555, roleId: 101, asKind: 'speaker', congregationId: 10 },
        { assignmentId: 555, roleId: 200, asKind: 'reader', congregationId: 10 },
      ],
      skipDuplicates: true,
    })
    expect(mockDb.programmeServiceRoleAssignmentAllowedRole.createMany).toHaveBeenCalledWith({
      data: [
        { assignmentId: 666, roleId: 300, congregationId: 10 },
        { assignmentId: 666, roleId: 301, congregationId: 10 },
      ],
      skipDuplicates: true,
    })
  })

  it('does not call createMany on allowed-role tables when lists are empty', async () => {
    const template = {
      id: 5,
      name: 'Reunion',
      parts: [
        {
          id: 10,
          name: 'Cantique',
          section: '',
          track: '',
          order: 1,
          durationMin: 5,
          speakerLabel: null,
          readerLabel: null,
          allowedRoles: [],
        },
      ],
      serviceRoles: [{ id: 20, name: 'Son', allowedRoles: [] }],
    }
    mockDb.programmeTemplate.findFirst.mockResolvedValue(template)
    mockDb.event.update.mockResolvedValue({})
    mockDb.programmePartAssignment.create.mockResolvedValue({ id: 555 })
    mockDb.programmeServiceRoleAssignment.create.mockResolvedValue({ id: 666 })

    await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    expect(mockDb.programmePartAssignmentAllowedRole.createMany).not.toHaveBeenCalled()
    expect(mockDb.programmeServiceRoleAssignmentAllowedRole.createMany).not.toHaveBeenCalled()
  })
})

describe('addPartAssignment audit firing', () => {
  it('fires PartAllowedRolesChanged when role lists change', async () => {
    mockDb.programmePartAssignment.create.mockResolvedValue({ id: 100 })
    vi.mocked(allowedRoles.setPartAssignmentAllowedRoles).mockResolvedValueOnce({ added: [5], removed: [] })
    vi.mocked(allowedRoles.setPartAssignmentAllowedRoles).mockResolvedValueOnce({ added: [], removed: [] })

    await addPartAssignment(
      mockDb as never,
      {
        eventId: 1,
        name: 'Discours',
        section: '',
        track: '',
        order: 1,
        durationMin: 30,
        allowExternalSpeaker: false,
        allowedSpeakerRoleIds: [5],
        allowedReaderRoleIds: [],
        congregationId: 10,
      },
      42,
    )

    expect(vi.mocked(auditModule.audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'part.allowed_roles.changed',
        entityType: 'ProgrammePartAssignment',
        entityId: 100,
        actorId: 42,
      }),
    )
  })

  it('does not fire audit when role lists do not change', async () => {
    mockDb.programmePartAssignment.create.mockResolvedValue({ id: 100 })
    vi.mocked(allowedRoles.setPartAssignmentAllowedRoles).mockResolvedValue({ added: [], removed: [] })

    await addPartAssignment(
      mockDb as never,
      {
        eventId: 1,
        name: 'Discours',
        section: '',
        track: '',
        order: 1,
        durationMin: 30,
        allowExternalSpeaker: false,
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
        congregationId: 10,
      },
      42,
    )

    expect(vi.mocked(auditModule.audit)).not.toHaveBeenCalled()
  })
})

describe('addServiceRoleAssignment audit firing', () => {
  it('fires ServiceRoleAllowedRolesChanged when role list changes', async () => {
    mockDb.programmeServiceRoleAssignment.create.mockResolvedValue({ id: 200 })
    vi.mocked(allowedRoles.setServiceRoleAssignmentAllowedRoles).mockResolvedValueOnce({ added: [7], removed: [] })

    await addServiceRoleAssignment(
      mockDb as never,
      { eventId: 1, name: 'Son', allowedRoleIds: [7], congregationId: 10 },
      42,
    )

    expect(vi.mocked(auditModule.audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_role.allowed_roles.changed',
        entityType: 'ProgrammeServiceRoleAssignment',
        entityId: 200,
        actorId: 42,
      }),
    )
  })

  it('does not fire audit when role list does not change', async () => {
    mockDb.programmeServiceRoleAssignment.create.mockResolvedValue({ id: 200 })
    vi.mocked(allowedRoles.setServiceRoleAssignmentAllowedRoles).mockResolvedValue({ added: [], removed: [] })

    await addServiceRoleAssignment(
      mockDb as never,
      { eventId: 1, name: 'Son', allowedRoleIds: [], congregationId: 10 },
      42,
    )

    expect(vi.mocked(auditModule.audit)).not.toHaveBeenCalled()
  })
})
