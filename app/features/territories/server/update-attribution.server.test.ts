import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  db: { attribution: { update: vi.fn() } },
}))

const { updateAttribution } = await import('./update-attribution.server')
const { db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('updateAttribution', () => {
  it('returns the updated attribution with required fields only', async () => {
    const fake = { id: 1, publisherId: 10, type: 'standard' }
    vi.mocked(db.attribution.update).mockResolvedValue(fake as never)

    const result = await updateAttribution(db as any, 1, 1, {
      publisherId: 10,
      notes: 'test',
      type: 'standard',
      startDate: new Date('2025-01-01'),
    })

    expect(result).toEqual(fake)
  })

  it('does not include lateDate or endDate when not provided', async () => {
    vi.mocked(db.attribution.update).mockResolvedValue({} as never)
    const startDate = new Date('2025-03-01')

    await updateAttribution(db as any, 5, 2, {
      publisherId: 3,
      notes: 'note',
      type: 'campaign',
      startDate,
    })

    const call = vi.mocked(db.attribution.update).mock.calls[0][0] as any
    expect(call.data).not.toHaveProperty('lateDate')
    expect(call.data).not.toHaveProperty('endDate')
    expect(call.data.publisherId).toBe(3)
    expect(call.data.startDate).toBe(startDate)
  })

  it('includes lateDate when provided', async () => {
    vi.mocked(db.attribution.update).mockResolvedValue({} as never)
    const lateDate = new Date('2025-06-01')

    await updateAttribution(db as any, 5, 2, {
      publisherId: 3,
      notes: '',
      type: 'standard',
      startDate: new Date('2025-01-01'),
      lateDate,
    })

    const call = vi.mocked(db.attribution.update).mock.calls[0][0] as any
    expect(call.data.lateDate).toBe(lateDate)
  })

  it('includes endDate when provided', async () => {
    vi.mocked(db.attribution.update).mockResolvedValue({} as never)
    const endDate = new Date('2025-12-31')

    await updateAttribution(db as any, 5, 2, {
      publisherId: 3,
      notes: '',
      type: 'standard',
      startDate: new Date('2025-01-01'),
      endDate,
    })

    const call = vi.mocked(db.attribution.update).mock.calls[0][0] as any
    expect(call.data.endDate).toBe(endDate)
  })
})
