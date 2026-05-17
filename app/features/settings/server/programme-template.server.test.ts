import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createProgrammeTemplate } from './programme-template.server'

const mockDb = {
  programmeTemplate: {
    create: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createProgrammeTemplate', () => {
  it('creates a recurring template when weekDay is provided', async () => {
    const expected = { id: 1, name: 'Reunion', key: 'meeting', weekDay: 3, isRecurring: true }
    mockDb.programmeTemplate.create.mockResolvedValue(expected)

    const result = await createProgrammeTemplate(mockDb as never, {
      name: 'Reunion',
      key: 'meeting',
      weekDay: 3,
      startTime: '19:00',
      endTime: '21:00',
      congregationId: 10,
    })

    expect(result).toEqual(expected)
    expect(mockDb.programmeTemplate.create).toHaveBeenCalledWith({
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
    mockDb.programmeTemplate.create.mockResolvedValue(expected)

    const result = await createProgrammeTemplate(mockDb as never, {
      name: 'Special',
      key: 'special',
      weekDay: null,
      startTime: '19:00',
      endTime: '21:00',
      congregationId: 10,
    })

    expect(result).toEqual(expected)
    expect(mockDb.programmeTemplate.create).toHaveBeenCalledWith({
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
})
