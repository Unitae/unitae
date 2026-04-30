import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn() },
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
} = await import('./programme-events.server')

const mockDb = {
  event: {
    create: vi.fn(),
    delete: vi.fn(),
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
  programmeTemplate: {
    findFirst: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createFreeformEvent', () => {
  it('creates an event with the given data', async () => {
    const data = {
      name: 'Reunion',
      startDate: new Date('2026-04-20'),
      endDate: new Date('2026-04-20'),
      createdById: 1,
      congregationId: 10,
    }
    const expected = { id: 1, ...data }
    mockDb.event.create.mockResolvedValue(expected)

    const result = await createFreeformEvent(mockDb as never, data)

    expect(result).toEqual(expected)
    expect(mockDb.event.create).toHaveBeenCalledWith({ data })
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
  it('updates an event with arbitrary data using compound key', async () => {
    const data = { name: 'Assemblee' }
    const expected = { id: 2, name: 'Assemblee' }
    mockDb.event.update.mockResolvedValue(expected)

    const result = await updateEvent(mockDb as never, 2, 10, data)

    expect(result).toEqual(expected)
    expect(mockDb.event.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 2, congregationId: 10 } },
      data,
    })
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
      congregationId: 10,
    }
    const expected = { id: 1, ...data }
    mockDb.programmePartAssignment.create.mockResolvedValue(expected)

    const result = await addPartAssignment(mockDb as never, data)

    expect(result).toEqual(expected)
    expect(mockDb.programmePartAssignment.create).toHaveBeenCalledWith({ data })
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
    const data = { eventId: 1, name: 'Son', congregationId: 10 }
    const expected = { id: 1, ...data }
    mockDb.programmeServiceRoleAssignment.create.mockResolvedValue(expected)

    const result = await addServiceRoleAssignment(mockDb as never, data)

    expect(result).toEqual(expected)
    expect(mockDb.programmeServiceRoleAssignment.create).toHaveBeenCalledWith({ data })
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
        { id: 10, name: 'Cantique', section: 'intro', track: 'A', order: 1, durationMin: 5 },
        { id: 11, name: 'Discours', section: 'main', track: 'A', order: 2, durationMin: 30 },
      ],
      serviceRoles: [{ id: 20, name: 'Son' }],
    }
    mockDb.programmeTemplate.findFirst.mockResolvedValue(template)
    mockDb.event.update.mockResolvedValue({})
    mockDb.programmePartAssignment.create.mockResolvedValue({})
    mockDb.programmeServiceRoleAssignment.create.mockResolvedValue({})

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
        congregationId: 10,
      },
    })
    expect(mockDb.programmeServiceRoleAssignment.create).toHaveBeenCalledWith({
      data: { eventId: 1, serviceRoleId: 20, name: 'Son', congregationId: 10 },
    })
  })
})
