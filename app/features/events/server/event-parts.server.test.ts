import { beforeEach, describe, expect, it, vi } from 'vitest'

// Schedules are written beside the items (the schedules' expand step); their own tests cover them.
vi.mock('~/features/events/server/schedules.server', () => ({
  alignEventSchedules: vi.fn(),
  attachEventItems: vi.fn(),
  deleteEventSchedules: vi.fn(),
  eventScheduleId: vi.fn(),
  setEventSchedulesStatus: vi.fn(),
}))
vi.mock('~/features/events/server/schedule-templates.server', () => ({
  deleteTemplateScheduleTemplates: vi.fn(),
  syncTemplateScheduleTemplates: vi.fn(),
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn() },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('~/features/events/server/allowed-roles.server', () => ({
  setPartAssignmentAllowedRoles: vi.fn().mockResolvedValue({ added: [], removed: [] }),
  setServicePartAssignmentAllowedRoles: vi.fn().mockResolvedValue({ added: [], removed: [] }),
}))

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  auditInTransaction: vi.fn(),
  AuditAction: {
    EventCreated: 'event.created',
    PartAllowedRolesChanged: 'part.allowed_roles.changed',
    ServicePartAllowedRolesChanged: 'service_role.allowed_roles.changed',
    EventDeleted: 'event.deleted',
    EventUpdated: 'event.updated',
    ProgrammeRemoved: 'event.programme_removed',
  },
}))

const {
  createFreeformEvent,
  updateEvent,
  addPartAssignment,
  updatePartAssignment,
  deletePartAssignment,
  addServicePartAssignment,
  deleteServicePartAssignment,
} = await import('./event-parts.server')
const { setPartAssignmentAllowedRoles } = await import('~/features/events/server/allowed-roles.server')

const mockDb = {
  event: {
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  eventPart: {
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  eventServicePart: {
    aggregate: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
  attendance: {
    findMany: vi.fn(),
  },
  notificationEvent: {
    updateMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
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
  mockDb.attendance.findMany.mockResolvedValue([])
  mockDb.notificationEvent.updateMany.mockResolvedValue({ count: 0 })
  mockDb.eventServicePart.aggregate.mockResolvedValue({ _max: { order: null } })
  mockDb.eventPart.deleteMany.mockResolvedValue({ count: 0 })
  mockDb.eventServicePart.deleteMany.mockResolvedValue({ count: 0 })
  mockDb.eventPart.findMany.mockResolvedValue([])
  mockDb.eventServicePart.findMany.mockResolvedValue([])
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

  it('records who created the event in the audit trail', async () => {
    const data = {
      name: 'Nettoyage',
      startDate: new Date('2027-01-16T13:00:00Z'),
      endDate: new Date('2027-01-16T16:00:00Z'),
      createdById: 42,
      congregationId: 10,
    }
    mockDb.eventTemplate.findFirst.mockResolvedValue({ id: 99, key: 'freeform' })
    mockDb.event.create.mockResolvedValue({ id: 555, ...data })

    await createFreeformEvent(mockDb as never, data)

    expect(vi.mocked(auditModule.auditInTransaction).mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({
        action: 'event.created',
        actorId: 42,
        congregationId: 10,
        entityType: 'Event',
        entityId: 555,
      }),
    )
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

  // A meeting created ahead that someone moves for one week is theirs now: the template's « Déplacer les réunions à
  // venir » never sends it back, and the recurring-events job's clean-ups leave it alone.
  it('makes whoever moves a meeting the job created its author, and leaves an author in place', async () => {
    mockDb.event.update.mockResolvedValue({ id: 2 })

    await updateEvent(mockDb as never, 2, 10, { startDate: new Date('2026-11-17T18:00:00Z') }, 99)

    expect(mockDb.event.updateMany).toHaveBeenCalledWith({
      where: { id: 2, congregationId: 10, origin: 'job' },
      data: { origin: 'manual', createdById: 99 },
    })
  })

  it('leaves the author alone when only the name changes', async () => {
    mockDb.event.update.mockResolvedValue({ id: 2 })

    await updateEvent(mockDb as never, 2, 10, { name: 'Visite du responsable de circonscription' }, 99)

    expect(mockDb.event.updateMany).not.toHaveBeenCalled()
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

describe('part allowed roles the form did not manage', () => {
  // With a kind selected the part form hides its role pickers, so the intent
  // sends nothing for them. Writing an empty selection there would delete the
  // part's own rows — the very rows the kind falls back to when it restricts
  // nobody.
  it('leaves both slots untouched when the caller omits them', async () => {
    mockDb.eventPart.update.mockResolvedValue({ id: 5 })

    await updatePartAssignment(
      mockDb as never,
      5,
      {
        name: 'Discours public',
        section: 'main',
        track: 'A',
        order: 1,
        durationMin: 30,
        allowExternalSpeaker: false,
        presetId: 55,
      },
      10,
      99,
    )

    expect(setPartAssignmentAllowedRoles).not.toHaveBeenCalled()
  })

  it('still writes the slots the caller does supply', async () => {
    mockDb.eventPart.update.mockResolvedValue({ id: 5 })

    await updatePartAssignment(
      mockDb as never,
      5,
      {
        name: 'Discours public',
        section: 'main',
        track: 'A',
        order: 1,
        durationMin: 30,
        allowExternalSpeaker: false,
        allowedSpeakerRoleIds: [7],
        allowedReaderRoleIds: [],
      },
      10,
      99,
    )

    expect(setPartAssignmentAllowedRoles).toHaveBeenCalledWith(mockDb, 5, 'speaker', [7], 10)
    expect(setPartAssignmentAllowedRoles).toHaveBeenCalledWith(mockDb, 5, 'reader', [], 10)
  })

  it('does not write either slot on create when the caller omits them', async () => {
    mockDb.eventPart.create.mockResolvedValue({ id: 6 })

    await addPartAssignment(
      mockDb as never,
      {
        eventId: 1,
        name: 'Discours public',
        section: 'main',
        track: 'A',
        order: 1,
        durationMin: 30,
        allowExternalSpeaker: false,
        presetId: 55,
        congregationId: 10,
      },
      99,
    )

    expect(setPartAssignmentAllowedRoles).not.toHaveBeenCalled()
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
    expect(mockDb.eventServicePart.create).toHaveBeenCalledWith({ data: { ...createData, order: 0 } })
  })

  it('puts the service after the ones the event has', async () => {
    mockDb.eventServicePart.aggregate.mockResolvedValue({ _max: { order: 10 } })
    mockDb.eventServicePart.create.mockResolvedValue({ id: 2 })

    await addServicePartAssignment(
      mockDb as never,
      { eventId: 1, name: 'Micros', allowedRoleIds: [], congregationId: 10 },
      99,
    )

    // The last of this event's services, not of the congregation's.
    expect(mockDb.eventServicePart.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 1, congregationId: 10 } }),
    )
    expect(mockDb.eventServicePart.create).toHaveBeenCalledWith({
      data: { eventId: 1, name: 'Micros', congregationId: 10, order: 15 },
    })
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
