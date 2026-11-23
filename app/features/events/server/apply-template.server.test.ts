import { beforeEach, describe, expect, it, vi } from 'vitest'

// Schedules are written beside the items (the schedules' expand step); their own tests cover them.
vi.mock('~/features/events/server/schedules.server', () => ({
  alignEventSchedules: vi.fn(),
  attachEventItems: vi.fn(),
  deleteEventSchedules: vi.fn(),
  eventScheduleId: vi.fn(),
  eventSchedulesOf: vi.fn(),
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
  ITEM_SLOT: { speaker: 'main', reader: 'second' },
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

const { eventSchedulesOf } = await import('~/features/events/server/schedules.server')
const { applyTemplateToEvent } = await import('./apply-template.server')

const mockDb = {
  event: {
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  item: {
    aggregate: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  attendance: {
    findMany: vi.fn(),
  },
  notificationEvent: {
    updateMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
  itemAllowedRole: {
    createMany: vi.fn(),
  },
  templateItem: {
    findMany: vi.fn(),
  },
  eventTemplate: {
    findFirst: vi.fn(),
  },
}

const allowedRoles = await import('~/features/events/server/allowed-roles.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(allowedRoles.setPartAssignmentAllowedRoles).mockResolvedValue({ added: [], removed: [] })
  vi.mocked(allowedRoles.setServicePartAssignmentAllowedRoles).mockResolvedValue({ added: [], removed: [] })
  mockDb.attendance.findMany.mockResolvedValue([])
  mockDb.notificationEvent.updateMany.mockResolvedValue({ count: 0 })
  vi.mocked(eventSchedulesOf).mockImplementation(async (_db, _eventId, kinds) => ({
    programme: kinds.includes('programme') ? 77 : null,
    duty: kinds.includes('duty') ? 78 : null,
  }))
  mockDb.templateItem.findMany.mockResolvedValue([])
  mockDb.item.aggregate.mockResolvedValue({ _max: { order: null } })
  mockDb.item.deleteMany.mockResolvedValue({ count: 0 })
  mockDb.item.findMany.mockResolvedValue([])
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
    mockDb.templateItem.findMany.mockResolvedValue([
      { id: 900, legacyPartId: 10, legacyServiceId: null },
      { id: 901, legacyPartId: 11, legacyServiceId: null },
      { id: 902, legacyPartId: null, legacyServiceId: 20 },
    ])
    mockDb.item.create
      .mockResolvedValueOnce({ id: 999 })
      .mockResolvedValueOnce({ id: 1000 })
      .mockResolvedValueOnce({ id: 998 })

    const result = await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    expect(result).toEqual(template)
    expect(mockDb.event.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 1, congregationId: 10 } },
      data: { templateId: 5 },
    })
    // Two parts and one service.
    expect(mockDb.item.create).toHaveBeenCalledTimes(3)
    expect(mockDb.item.create).toHaveBeenCalledWith({
      data: {
        eventId: 1,
        scheduleId: 77,
        templateItemId: 900,
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
    expect(mockDb.item.create).toHaveBeenCalledWith({
      data: { eventId: 1, scheduleId: 78, templateItemId: 902, name: 'Son', congregationId: 10 },
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
    mockDb.item.create.mockResolvedValue({ id: 999 })

    await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    const calls = mockDb.item.create.mock.calls
    expect(calls.length).toBe(2)
    expect(calls[0][0].data).toMatchObject({ speakerLabel: 'STUDENT-SENTINEL-P1', readerLabel: null })
    expect(calls[1][0].data).toMatchObject({
      speakerLabel: 'STUDENT-SENTINEL-P2',
      readerLabel: 'HOUSEHOLDER-SENTINEL-P2',
    })
  })

  it('copies presetId from template parts to assignments', async () => {
    // Regression: applyTemplateToEvent is the second template -> event path
    // (programme creation is the other). It copied the labels but
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
    mockDb.item.create.mockResolvedValue({ id: 999 })

    await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    const calls = mockDb.item.create.mock.calls
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
    mockDb.item.create.mockResolvedValueOnce({ id: 555 }).mockResolvedValueOnce({ id: 666 })
    mockDb.itemAllowedRole.createMany.mockResolvedValue({ count: 3 })

    await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    expect(mockDb.itemAllowedRole.createMany).toHaveBeenCalledWith({
      data: [
        { itemId: 555, roleId: 100, slot: 'main', congregationId: 10 },
        { itemId: 555, roleId: 101, slot: 'main', congregationId: 10 },
        { itemId: 555, roleId: 200, slot: 'second', congregationId: 10 },
      ],
      skipDuplicates: true,
    })
    expect(mockDb.itemAllowedRole.createMany).toHaveBeenCalledWith({
      data: [
        { itemId: 666, roleId: 300, slot: 'main', congregationId: 10 },
        { itemId: 666, roleId: 301, slot: 'main', congregationId: 10 },
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
    mockDb.item.create.mockResolvedValue({ id: 555 })

    await applyTemplateToEvent(mockDb as never, 1, 5, 10, 42)

    expect(mockDb.itemAllowedRole.createMany).not.toHaveBeenCalled()
  })
})
