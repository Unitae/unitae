import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/geocoder.server', () => ({ geocode: vi.fn() }))

const { geocode } = await import('~/shared/infra/geocoder.server')
const { resolveSearchPlace } = await import('./search-place.server')

beforeEach(() => vi.resetAllMocks())

// A search that names a place sorts the lists by distance from it; the lists say when the place was not found, or
// when `@` came without one.

describe('resolveSearchPlace', () => {
  it('finds the place an address names', async () => {
    vi.mocked(geocode).mockResolvedValue({ formatted: '12 rue Voltaire', lat: 45.76, lng: 4.83 } as never)

    expect(await resolveSearchPlace('12 rue Voltaire')).toEqual({ origin: { lat: 45.76, lng: 4.83 }, notice: null })
  })

  it('asks nothing for a name or a number, and says nothing', async () => {
    expect(await resolveSearchPlace('Dupont')).toEqual({ origin: null, notice: null })
    expect(await resolveSearchPlace('')).toEqual({ origin: null, notice: null })
    expect(geocode).not.toHaveBeenCalled()
  })

  it('says when the place was not found', async () => {
    vi.mocked(geocode).mockResolvedValue(null)

    expect(await resolveSearchPlace('@ rue inconnue')).toEqual({
      origin: null,
      notice: { kind: 'failed', query: 'rue inconnue' },
    })
  })

  it('says when « @ » came without a place', async () => {
    expect(await resolveSearchPlace('@')).toEqual({ origin: null, notice: { kind: 'missing-query' } })
  })
})
