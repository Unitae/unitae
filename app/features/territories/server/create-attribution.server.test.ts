import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/settings.server', () => ({
  getSetting: vi.fn(),
}))

const mockDb = {
  attribution: { create: vi.fn() },
}

const { createAttribution } = await import('./create-attribution.server')
const { getSetting } = await import('~/shared/domain/settings.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createAttribution', () => {
  it('creates attribution with default lateDate (startDate + 4 months) when no setting exists', async () => {
    vi.mocked(getSetting).mockResolvedValue(undefined)
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

  it('uses configured duration from setting', async () => {
    vi.mocked(getSetting).mockResolvedValue('6')
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
    expectedLateDate.setMonth(expectedLateDate.getMonth() + 6)

    expect(call.data.lateDate).toEqual(expectedLateDate)
  })

  it('returns the created attribution', async () => {
    vi.mocked(getSetting).mockResolvedValue(undefined)
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
