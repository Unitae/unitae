import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {
  attribution: { create: vi.fn() },
}

const { createAttribution } = await import('./create-attribution.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createAttribution', () => {
  it('creates attribution with correct lateDate (startDate + 4 months)', async () => {
    mockDb.attribution.create.mockResolvedValue({} as never)

    await createAttribution(mockDb as any, {
      publisherId: 1,
      territoryId: 2,
      startDate: '2025-03-15',
      notes: 'test',
      type: 'standard',
      congregationId: 10,
    })

    const call = mockDb.attribution.create.mock.calls[0][0]
    const expectedLateDate = new Date('2025-03-15')
    expectedLateDate.setMonth(expectedLateDate.getMonth() + 4)

    expect(call.data.lateDate).toEqual(expectedLateDate)
    expect(call.data.startDate).toEqual(new Date('2025-03-15'))
  })

  it('returns the created attribution', async () => {
    const fake = { id: 42, publisherId: 1, territoryId: 2 }
    mockDb.attribution.create.mockResolvedValue(fake as never)

    const result = await createAttribution(mockDb as any, {
      publisherId: 1,
      territoryId: 2,
      startDate: '2025-01-01',
      notes: '',
      type: 'campaign',
      congregationId: 5,
    })

    expect(result).toEqual(fake)
  })
})
