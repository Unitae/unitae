import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConflictError, NotFoundError, ValidationError } from '~/shared/errors/app-error.server'

vi.mock('~/shared/domain/audit.server', () => ({ AuditAction: {}, audit: vi.fn() }))

const mockDb = { attribution: { findFirst: vi.fn(), update: vi.fn() } }

const { returnAttribution } = await import('./return-attribution.server')

beforeEach(() => vi.resetAllMocks())

// « Rentrer » records the day a territory came back. The day is a calendar day read like the day it went out, never
// before it and never after today; a territory already rentré cannot come back twice.

const input = { id: 7, endDay: '2026-11-09', today: '2026-11-09', congregationId: 10, actorId: 3 }

describe('returnAttribution', () => {
  it('records the day the territory came back, read like the day it went out', async () => {
    mockDb.attribution.findFirst.mockResolvedValue({ id: 7, startDate: new Date(2026, 3, 25), endDate: null })
    mockDb.attribution.update.mockImplementation(async ({ data }) => ({ id: 7, ...data }))

    const result = await returnAttribution(mockDb as never, input)

    expect(result.endDate).toEqual(new Date(2026, 10, 9))
  })

  it('accepts the day it went out: a territory can come back the same day', async () => {
    mockDb.attribution.findFirst.mockResolvedValue({ id: 7, startDate: new Date(2026, 10, 9), endDate: null })
    mockDb.attribution.update.mockImplementation(async ({ data }) => ({ id: 7, ...data }))

    await expect(returnAttribution(mockDb as never, input)).resolves.toMatchObject({ endDate: new Date(2026, 10, 9) })
  })

  it('refuses an attribution of another congregation, or one that does not exist', async () => {
    mockDb.attribution.findFirst.mockResolvedValue(null)

    await expect(returnAttribution(mockDb as never, input)).rejects.toBeInstanceOf(NotFoundError)
    expect(mockDb.attribution.findFirst.mock.calls[0]?.[0].where).toEqual({ id: 7, congregationId: 10 })
  })

  it('refuses a territory already rentré', async () => {
    mockDb.attribution.findFirst.mockResolvedValue({
      id: 7,
      startDate: new Date(2026, 3, 25),
      endDate: new Date(2026, 9, 1),
    })

    await expect(returnAttribution(mockDb as never, input)).rejects.toBeInstanceOf(ConflictError)
    expect(mockDb.attribution.update).not.toHaveBeenCalled()
  })

  it('refuses a day before it went out, or after today', async () => {
    mockDb.attribution.findFirst.mockResolvedValue({ id: 7, startDate: new Date(2026, 10, 2), endDate: null })

    await expect(returnAttribution(mockDb as never, { ...input, endDay: '2026-11-01' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(returnAttribution(mockDb as never, { ...input, endDay: '2026-11-10' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(mockDb.attribution.update).not.toHaveBeenCalled()
  })
})
