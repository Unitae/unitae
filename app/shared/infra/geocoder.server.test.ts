import { Status } from '@googlemaps/google-maps-services-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.fn<(key: string) => Promise<string | null>>()
const mockSet = vi.fn<(key: string, value: string, mode: string, ttl: number) => Promise<'OK'>>()
const mockGeocode = vi.fn()

vi.mock('./redis.server', () => ({
  redis: {
    get: mockGet,
    set: mockSet,
  },
}))

vi.mock('@googlemaps/google-maps-services-js', async () => {
  const actual = await vi.importActual<typeof import('@googlemaps/google-maps-services-js')>(
    '@googlemaps/google-maps-services-js',
  )
  class MockClient {
    geocode = mockGeocode
  }
  return { ...actual, Client: MockClient }
})

beforeEach(() => {
  mockGet.mockReset()
  mockSet.mockReset()
  mockGeocode.mockReset()
  mockGet.mockResolvedValue(null)
  mockSet.mockResolvedValue('OK')
})

afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY
})

describe('geocode', () => {
  it('returns null and skips the API when GOOGLE_MAPS_API_KEY is missing', async () => {
    const { geocode } = await import('./geocoder.server')
    const result = await geocode('12 rue de la Paix')
    expect(result).toBeNull()
    expect(mockGeocode).not.toHaveBeenCalled()
  })

  it('returns null for empty/whitespace queries', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    const { geocode } = await import('./geocoder.server')
    expect(await geocode('   ')).toBeNull()
    expect(mockGeocode).not.toHaveBeenCalled()
  })

  it('returns a cached result without calling the API', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    const cached = {
      formatted: '12 Rue de la Paix, 75002 Paris, France',
      lat: 48.8696,
      lng: 2.3322,
      locationType: 'ROOFTOP' as const,
      alternates: [],
    }
    mockGet.mockResolvedValue(JSON.stringify(cached))

    const { geocode } = await import('./geocoder.server')
    const result = await geocode('12 rue de la Paix')

    expect(result).toEqual(cached)
    expect(mockGeocode).not.toHaveBeenCalled()
  })

  it('returns null when cache stores empty sentinel', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    mockGet.mockResolvedValue('')

    const { geocode } = await import('./geocoder.server')
    expect(await geocode('non-existent place')).toBeNull()
    expect(mockGeocode).not.toHaveBeenCalled()
  })

  it('calls the API on cache miss and writes the result back to Redis', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    mockGeocode.mockResolvedValue({
      data: {
        status: Status.OK,
        results: [
          {
            formatted_address: '12 Rue de la Paix, 75002 Paris, France',
            geometry: { location: { lat: 48.8696, lng: 2.3322 }, location_type: 'ROOFTOP' },
            place_id: 'paix-1',
          },
        ],
      },
    })

    const { geocode } = await import('./geocoder.server')
    const result = await geocode('12 rue de la Paix')

    expect(result).toMatchObject({
      formatted: '12 Rue de la Paix, 75002 Paris, France',
      lat: 48.8696,
      lng: 2.3322,
      locationType: 'ROOFTOP',
    })
    expect(mockSet).toHaveBeenCalledWith(
      'geocode:v1:12 rue de la paix',
      expect.stringContaining('Rue de la Paix'),
      'EX',
      60 * 60 * 24 * 90,
    )
  })

  it('caches a miss as the empty sentinel and returns null', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    mockGeocode.mockResolvedValue({
      data: { status: Status.ZERO_RESULTS, results: [] },
    })

    const { geocode } = await import('./geocoder.server')
    expect(await geocode('unfindable place')).toBeNull()
    expect(mockSet).toHaveBeenCalledWith('geocode:v1:unfindable place', '', 'EX', 60 * 60 * 24 * 90)
  })

  it('returns up to two alternates from extra API results', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    mockGeocode.mockResolvedValue({
      data: {
        status: Status.OK,
        results: [
          {
            formatted_address: 'Rue de la Paix, Paris',
            geometry: { location: { lat: 48.87, lng: 2.33 }, location_type: 'GEOMETRIC_CENTER' },
            place_id: 'paris',
          },
          {
            formatted_address: 'Rue de la Paix, Lyon',
            geometry: { location: { lat: 45.75, lng: 4.85 }, location_type: 'GEOMETRIC_CENTER' },
            place_id: 'lyon',
          },
          {
            formatted_address: 'Rue de la Paix, Nantes',
            geometry: { location: { lat: 47.21, lng: -1.55 }, location_type: 'GEOMETRIC_CENTER' },
            place_id: 'nantes',
          },
          {
            formatted_address: 'Rue de la Paix, Bordeaux',
            geometry: { location: { lat: 44.83, lng: -0.57 }, location_type: 'GEOMETRIC_CENTER' },
            place_id: 'bordeaux',
          },
        ],
      },
    })

    const { geocode } = await import('./geocoder.server')
    const result = await geocode('rue de la paix')
    expect(result?.alternates).toEqual([
      { formatted: 'Rue de la Paix, Lyon', placeId: 'lyon' },
      { formatted: 'Rue de la Paix, Nantes', placeId: 'nantes' },
    ])
  })

  it('returns null and does not cache when the API throws', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    mockGeocode.mockRejectedValue(new Error('network'))

    const { geocode } = await import('./geocoder.server')
    expect(await geocode('rue')).toBeNull()
    expect(mockSet).not.toHaveBeenCalled()
  })
})
