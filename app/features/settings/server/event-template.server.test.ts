import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  AuditAction: { TemplateCreated: 'event_template.created' },
  audit: vi.fn(),
}))

const { createEventTemplate } = await import('./event-template.server')
const { audit } = await import('~/shared/domain/audit.server')

const mockDb = {
  eventTemplate: {
    create: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createEventTemplate', () => {
  it('creates a recurring template when weekDay is provided', async () => {
    const expected = { id: 1, name: 'Reunion', key: 'meeting', weekDay: 3, isRecurring: true }
    mockDb.eventTemplate.create.mockResolvedValue(expected)

    const result = await createEventTemplate(mockDb as never, {
      name: 'Reunion',
      key: 'meeting',
      weekDay: 3,
      startTime: '19:00',
      endTime: '21:00',
      congregationId: 10,
      actorId: 9,
    })

    expect(result).toEqual(expected)
    expect(mockDb.eventTemplate.create).toHaveBeenCalledWith({
      data: {
        name: 'Reunion',
        key: 'meeting',
        weekDay: 3,
        isRecurring: true,
        startTime: '19:00',
        endTime: '21:00',
        congregationId: 10,
      },
    })
  })

  it('creates a non-recurring template when weekDay is null', async () => {
    const expected = { id: 2, name: 'Special', key: 'special', weekDay: null, isRecurring: false }
    mockDb.eventTemplate.create.mockResolvedValue(expected)

    const result = await createEventTemplate(mockDb as never, {
      name: 'Special',
      key: 'special',
      weekDay: null,
      startTime: '19:00',
      endTime: '21:00',
      congregationId: 10,
      actorId: 9,
    })

    expect(result).toEqual(expected)
    expect(mockDb.eventTemplate.create).toHaveBeenCalledWith({
      data: {
        name: 'Special',
        key: 'special',
        weekDay: null,
        isRecurring: false,
        startTime: '19:00',
        endTime: '21:00',
        congregationId: 10,
      },
    })
  })

  it('says in the audit log that the template was created', async () => {
    mockDb.eventTemplate.create.mockResolvedValue({ id: 4, name: 'Reunion' })

    await createEventTemplate(mockDb as never, {
      name: 'Reunion',
      key: 'meeting',
      weekDay: 3,
      startTime: '19:00',
      endTime: '21:00',
      congregationId: 10,
      actorId: 9,
    })

    expect(audit).toHaveBeenCalledWith({
      action: 'event_template.created',
      congregationId: 10,
      actorId: 9,
      entityType: 'EventTemplate',
      entityId: 4,
      metadata: { name: 'Reunion' },
    })
  })
})
