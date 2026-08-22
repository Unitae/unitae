import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn() },
}))

vi.mock('~/features/events/server/allowed-roles.server', () => ({
  setPartAssignmentAllowedRoles: vi.fn().mockResolvedValue({ added: [], removed: [] }),
  setServicePartAssignmentAllowedRoles: vi.fn().mockResolvedValue({ added: [], removed: [] }),
}))

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {
    PartAllowedRolesChanged: 'part.allowed_roles.changed',
    ServicePartAllowedRolesChanged: 'service_role.allowed_roles.changed',
    EventDeleted: 'event.deleted',
    EventUpdated: 'event.updated',
  },
}))

const {
  createFreeformEvent,
  deleteEvent,
  updateEvent,
  addPartAssignment,
  updatePartAssignment,
  deletePartAssignment,
  addServicePartAssignment,
  deleteServicePartAssignment,
  applyTemplateToEvent,
  bulkDeleteEvents,
} = await import('./event-parts.server')

const mockDb = {
  event: {
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
  },
  eventPart: {
    create: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  eventServicePart: {
    create: vi.fn(),
    delete: vi.fn(),
  },
  eventPartAllowedRole: {
    createMany: vi.fn(),
  },
  eventServicePartAllowedRole: {
    createMany: vi.fn(),
  },
  eventTemplate: {
    findFirst: vi.fn(),
  },
}

const allowedRoles = await import('~/features/events/server/allowed-roles.server')
const auditModule = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(allowedRoles.setPartAssignmentAllowedRoles).mockResolvedValue({ added: [], removed: [] })
  vi.mocked(allowedRoles.setServicePartAssignmentAllowedRoles).mockResolvedValue({ added: [], removed: [] })
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
    mockDb.eventTemplate.findFirst.mockResolvedValue({ id: 99, key: 'freeform' })
    const expected = { id: 1, ...data }
    mockDb.event.create.mockResolvedValue(expected)

    const result = await createFreeformEvent(mockDb as never, data)

    expect(result).toEqual(expected)
    expect(mockDb.eventTemplate.findFirst).toHaveBeenCalledWith({
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
    mockDb.eventTemplate.findFirst.mockResolvedValue(null)

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
    mockDb.eventPart.create.mockResolvedValue(expected)

    const result = await addPartAssignment(mockDb as never, data, 99)

    expect(result).toEqual(expected)
    expect(mockDb.eventPart.create).toHaveBeenCalledWith({ data: createData })
  })

  it('writes the chosen preset onto the assignment', async () => {
    mockDb.eventPart.create.mockResolvedValue({ id: 1 })

    await addPartAssignment(
      mockDb as never,
      {
        eventId: 1,
        name: '1re partie',
        section: 'Appliquons-nous au ministère',
        track: '',
        order: 5,
        durationMin: null,
        allowExternalSpeaker: false,
        // 4242 is a sentinel: far from any array index, so a pass-through
        // cannot be confused with a coincidental value.
        presetId: 4242,
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
        congregationId: 10,
      },
      99,
    )

    expect(mockDb.eventPart.create.mock.calls[0][0].data.presetId).toBe(4242)
  })

  it('writes a null preset when the part has no kind', async () => {
    // The ministry parts and songs legitimately have none.
    mockDb.eventPart.create.mockResolvedValue({ id: 1 })

    await addPartAssignment(
      mockDb as never,
      {
        eventId: 1,
        name: 'Cantique',
        section: '',
        track: '',
        order: 8,
        durationMin: 5,
        allowExternalSpeaker: false,
        presetId: null,
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
        congregationId: 10,
      },
      99,
    )

    expect(mockDb.eventPart.create.mock.calls[0][0].data.presetId).toBeNull()
  })

  it('passes speakerLabel and readerLabel to create when supplied (Layer 5)', async () => {
    mockDb.eventPart.create.mockResolvedValue({ id: 1 })

    await addPartAssignment(
      mockDb as never,
      {
        eventId: 1,
        name: 'Bible reading',
        section: 'main',
        track: 'A',
        order: 1,
        durationMin: 5,
        allowExternalSpeaker: false,
        speakerLabel: 'STUDENT-SENTINEL',
        readerLabel: 'HOUSEHOLDER-SENTINEL',
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
        congregationId: 10,
      },
      99,
    )

    expect(mockDb.eventPart.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ speakerLabel: 'STUDENT-SENTINEL', readerLabel: 'HOUSEHOLDER-SENTINEL' }),
    })
  })
})

describe('updatePartAssignment preset', () => {
  it('changes the kind of an existing assignment', async () => {
    // Load-bearing: "1re partie" is a demonstration one week and a talk the
    // next, so the kind must be settable per event, not only per template.
    mockDb.eventPart.update.mockResolvedValue({ id: 3 })

    await updatePartAssignment(
      mockDb as never,
      3,
      {
        name: '1re partie',
        section: 'Appliquons-nous au ministère',
        track: '',
        order: 5,
        durationMin: null,
        allowExternalSpeaker: false,
        presetId: 4242,
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
      },
      10,
      99,
    )

    expect(mockDb.eventPart.update.mock.calls[0][0].data.presetId).toBe(4242)
  })

  it('clears the kind back to none', async () => {
    mockDb.eventPart.update.mockResolvedValue({ id: 3 })

    await updatePartAssignment(
      mockDb as never,
      3,
      {
        name: '1re partie',
        section: '',
        track: '',
        order: 5,
        durationMin: null,
        allowExternalSpeaker: false,
        presetId: null,
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
      },
      10,
      99,
    )

    expect(mockDb.eventPart.update.mock.calls[0][0].data.presetId).toBeNull()
  })
})

describe('deletePartAssignment', () => {
  it('deletes a part assignment using compound key', async () => {
    mockDb.eventPart.delete.mockResolvedValue({ id: 5 })

    const result = await deletePartAssignment(mockDb as never, 5, 10)

    expect(result).toEqual({ id: 5 })
    expect(mockDb.eventPart.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 5, congregationId: 10 } },
    })
  })
})

describe('updatePartAssignment', () => {
  it('passes speakerLabel and readerLabel to the update when supplied (Layer 5)', async () => {
    mockDb.eventPart.update.mockResolvedValue({ id: 5 })

    await updatePartAssignment(
      mockDb as never,
      5,
      {
        name: 'Bible reading',
        section: 'main',
        track: 'A',
        order: 1,
        durationMin: 5,
        allowExternalSpeaker: false,
        speakerLabel: 'STUDENT-SENTINEL',
        readerLabel: 'HOUSEHOLDER-SENTINEL',
        allowedSpeakerRoleIds: [],
        allowedReaderRoleIds: [],
      },
      10,
      99,
    )

    expect(mockDb.eventPart.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 5, congregationId: 10 } },
      data: expect.objectContaining({ speakerLabel: 'STUDENT-SENTINEL', readerLabel: 'HOUSEHOLDER-SENTINEL' }),
    })
  })
})

describe('addServicePartAssignment', () => {
  it('creates a service role assignment', async () => {
    const data = { eventId: 1, name: 'Son', allowedRoleIds: [], congregationId: 10 }
    const { allowedRoleIds: _a, ...createData } = data
    const expected = { id: 1, ...createData }
    mockDb.eventServicePart.create.mockResolvedValue(expected)

    const result = await addServicePartAssignment(mockDb as never, data, 99)

    expect(result).toEqual(expected)
    expect(mockDb.eventServicePart.create).toHaveBeenCalledWith({ data: createData })
  })
})

describe('deleteServicePartAssignment', () => {
  it('deletes a service role assignment using compound key', async () => {
    mockDb.eventServicePart.delete.mockResolvedValue({ id: 8 })

    const result = await deleteServicePartAssignment(mockDb as never, 8, 10)

    expect(result).toEqual({ id: 8 })
    expect(mockDb.eventServicePart.delete).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 8, congregationId: 10 } },
    })
  })
})

describe('applyTemplateToEvent', () => {
  it('returns null when template is not found', async () => {
    mockDb.eventTemplate.findFirst.mockResolvedValue(null)

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
      serviceParts: [{ id: 20, name: 'Son', allowedRoles: [] }],
    }
    mockDb.eventTemplate.findFirst.mockResolvedValue(template)
    mockDb.event.update.mockResolvedValue({})
    mockDb.eventPart.create.mockResolvedValue({ id: 999 })
    mockDb.eventServicePart.create.mockResolvedValue({ id: 998 })

    const result = await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    expect(result).toEqual(template)
    expect(mockDb.event.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 1, congregationId: 10 } },
      data: { templateId: 5 },
    })
    expect(mockDb.eventPart.create).toHaveBeenCalledTimes(2)
    expect(mockDb.eventPart.create).toHaveBeenCalledWith({
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
    expect(mockDb.eventServicePart.create).toHaveBeenCalledWith({
      data: { eventId: 1, servicePartId: 20, name: 'Son', congregationId: 10 },
    })
  })

  // Sentinel test: proves the two label fields are threaded from the template
  // and not fabricated by the caller. A regression that hardcodes null would
  // pass the existing shape assertion above (both fields are null there) but
  // fails this one.
  it('copies speakerLabel and readerLabel from template parts to assignments (Layer 4)', async () => {
    // Distinct sentinels per part — a regression that swaps parts[0] and parts[1]
    // during the copy would produce a false positive if both used the same value.
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
          speakerLabel: 'STUDENT-SENTINEL-P1',
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
          speakerLabel: 'STUDENT-SENTINEL-P2',
          readerLabel: 'HOUSEHOLDER-SENTINEL-P2',
          allowedRoles: [],
        },
      ],
      serviceParts: [],
    }
    mockDb.eventTemplate.findFirst.mockResolvedValue(template)
    mockDb.event.update.mockResolvedValue({})
    mockDb.eventPart.create.mockResolvedValue({ id: 999 })

    await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    const calls = mockDb.eventPart.create.mock.calls
    expect(calls.length).toBe(2)
    expect(calls[0][0].data).toMatchObject({ speakerLabel: 'STUDENT-SENTINEL-P1', readerLabel: null })
    expect(calls[1][0].data).toMatchObject({
      speakerLabel: 'STUDENT-SENTINEL-P2',
      readerLabel: 'HOUSEHOLDER-SENTINEL-P2',
    })
  })

  it('copies presetId from template parts to assignments', async () => {
    // Regression: applyTemplateToEvent is the second template -> event path
    // (generateEventsFromTemplate is the other). It copied the labels but
    // dropped the preset, so applying a template to an existing event produced
    // parts with no kind — and therefore no share message.
    // Distinct sentinels per part so a copy that swaps them still fails.
    const template = {
      id: 5,
      name: 'Reunion',
      parts: [
        {
          id: 10,
          name: 'Lecture de la Bible',
          section: 'main',
          track: 'A',
          order: 1,
          durationMin: 5,
          speakerLabel: null,
          readerLabel: null,
          presetId: 7101,
          allowedRoles: [],
        },
        {
          id: 11,
          name: 'Cantique',
          section: '',
          track: '',
          order: 2,
          durationMin: 5,
          speakerLabel: null,
          readerLabel: null,
          // Songs legitimately have no kind — null must survive as null.
          presetId: null,
          allowedRoles: [],
        },
      ],
      serviceParts: [],
    }
    mockDb.eventTemplate.findFirst.mockResolvedValue(template)
    mockDb.event.update.mockResolvedValue({})
    mockDb.eventPart.create.mockResolvedValue({ id: 999 })

    await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    const calls = mockDb.eventPart.create.mock.calls
    expect(calls[0][0].data.presetId).toBe(7101)
    expect(calls[1][0].data.presetId).toBeNull()
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
      serviceParts: [{ id: 20, name: 'Son', allowedRoles: [{ roleId: 300 }, { roleId: 301 }] }],
    }
    mockDb.eventTemplate.findFirst.mockResolvedValue(template)
    mockDb.event.update.mockResolvedValue({})
    mockDb.eventPart.create.mockResolvedValue({ id: 555 })
    mockDb.eventServicePart.create.mockResolvedValue({ id: 666 })
    mockDb.eventPartAllowedRole.createMany.mockResolvedValue({ count: 3 })
    mockDb.eventServicePartAllowedRole.createMany.mockResolvedValue({ count: 2 })

    await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    expect(mockDb.eventPartAllowedRole.createMany).toHaveBeenCalledWith({
      data: [
        { eventPartId: 555, roleId: 100, asKind: 'speaker', congregationId: 10 },
        { eventPartId: 555, roleId: 101, asKind: 'speaker', congregationId: 10 },
        { eventPartId: 555, roleId: 200, asKind: 'reader', congregationId: 10 },
      ],
      skipDuplicates: true,
    })
    expect(mockDb.eventServicePartAllowedRole.createMany).toHaveBeenCalledWith({
      data: [
        { eventServicePartId: 666, roleId: 300, congregationId: 10 },
        { eventServicePartId: 666, roleId: 301, congregationId: 10 },
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
      serviceParts: [{ id: 20, name: 'Son', allowedRoles: [] }],
    }
    mockDb.eventTemplate.findFirst.mockResolvedValue(template)
    mockDb.event.update.mockResolvedValue({})
    mockDb.eventPart.create.mockResolvedValue({ id: 555 })
    mockDb.eventServicePart.create.mockResolvedValue({ id: 666 })

    await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    expect(mockDb.eventPartAllowedRole.createMany).not.toHaveBeenCalled()
    expect(mockDb.eventServicePartAllowedRole.createMany).not.toHaveBeenCalled()
  })
})

describe('addPartAssignment audit firing', () => {
  it('fires PartAllowedRolesChanged when role lists change', async () => {
    mockDb.eventPart.create.mockResolvedValue({ id: 100 })
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
        entityType: 'EventPart',
        entityId: 100,
        actorId: 42,
      }),
    )
  })

  it('does not fire audit when role lists do not change', async () => {
    mockDb.eventPart.create.mockResolvedValue({ id: 100 })
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

describe('addServicePartAssignment audit firing', () => {
  it('fires ServicePartAllowedRolesChanged when role list changes', async () => {
    mockDb.eventServicePart.create.mockResolvedValue({ id: 200 })
    vi.mocked(allowedRoles.setServicePartAssignmentAllowedRoles).mockResolvedValueOnce({ added: [7], removed: [] })

    await addServicePartAssignment(
      mockDb as never,
      { eventId: 1, name: 'Son', allowedRoleIds: [7], congregationId: 10 },
      42,
    )

    expect(vi.mocked(auditModule.audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_role.allowed_roles.changed',
        entityType: 'EventServicePart',
        entityId: 200,
        actorId: 42,
      }),
    )
  })

  it('does not fire audit when role list does not change', async () => {
    mockDb.eventServicePart.create.mockResolvedValue({ id: 200 })
    vi.mocked(allowedRoles.setServicePartAssignmentAllowedRoles).mockResolvedValue({ added: [], removed: [] })

    await addServicePartAssignment(
      mockDb as never,
      { eventId: 1, name: 'Son', allowedRoleIds: [], congregationId: 10 },
      42,
    )

    expect(vi.mocked(auditModule.audit)).not.toHaveBeenCalled()
  })
})
