import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/settings.server', () => ({ getSetting: vi.fn() }))

const { getSetting } = await import('~/shared/domain/settings.server')
const { resolveDurationDays } = await import('./attribution-duration.queries')

const db = {} as never

beforeEach(() => vi.resetAllMocks())

// How long an attribution runs before it is due back: the congregation's setting for its method and its kind of
// territory, the built-in default otherwise.

describe('resolveDurationDays', () => {
  it('uses the defaults without settings: 120 days, 14 by phone', async () => {
    vi.mocked(getSetting).mockResolvedValue(undefined)
    expect(await resolveDurationDays(db, 'Default', 'Classical', 4)).toBe(120)
    expect(await resolveDurationDays(db, 'Phone', 'Classical', 4)).toBe(14)
    expect(await resolveDurationDays(db, 'Default', 'Commerces', 4)).toBe(120)
  })

  it('uses the setting of the method or of the kind', async () => {
    vi.mocked(getSetting).mockImplementation(
      async (_db, key) =>
        (
          ({
            'attribution-phone-duration-days': '21',
            'attribution-commerce-duration-days': '60',
            'attribution-default-duration-days': '90',
          }) as Record<string, string>
        )[key as string],
    )
    expect(await resolveDurationDays(db, 'Phone', 'Classical', 4)).toBe(21)
    expect(await resolveDurationDays(db, 'Default', 'Commerces', 4)).toBe(60)
    expect(await resolveDurationDays(db, 'Default', 'Classical', 4)).toBe(90)
  })

  it('still reads the old setting in months, thirty days each', async () => {
    vi.mocked(getSetting).mockImplementation(async (_db, key) =>
      key === 'attribution-default-duration-months' ? '3' : undefined,
    )
    expect(await resolveDurationDays(db, 'Default', 'Classical', 4)).toBe(90)
  })

  it('ignores a setting that is not a positive number', async () => {
    vi.mocked(getSetting).mockResolvedValue('soon')
    expect(await resolveDurationDays(db, 'Default', 'Classical', 4)).toBe(120)
  })
})
