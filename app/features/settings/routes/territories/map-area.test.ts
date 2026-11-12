import { beforeEach, describe, expect, it, vi } from 'vitest'

// « Télécharger la zone à couvrir »: the congregation's area as GeoJSON, for the host to cut a map file to. Only for
// whoever configures the territories, like the page that offers it.

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')
const congregationContext = Symbol('congregationContext')
vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  congregationContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown, congregationId: number) => unknown) => fn({}, 10),
}))

let mapArea: unknown
vi.mock('~/features/territories/index.server', () => ({ getMapArea: async () => mapArea }))

const { Permission } = await import('~/shared/types/permission')
const { loader } = await import('./map-area')

let granted: Set<string>
const context = {
  get: (key: symbol) => {
    if (key === permissionsContext) return granted
    if (key === congregationContext) return { displayName: 'Les Lilas', timezone: 'Europe/Paris', locale: 'fr' }
    return { id: 1, congregationId: 10 }
  },
}
const download = () => loader({ request: new Request('http://localhost/x'), context } as never) as Promise<Response>

beforeEach(() => {
  granted = new Set([Permission.CanConfigureTerritorySettings])
  mapArea = {
    area: { swLat: 48, swLng: 2, neLat: 49, neLng: 3 },
    perimeter: [
      { lat: 48.2, lng: 2.2 },
      { lat: 48.2, lng: 2.8 },
      { lat: 48.8, lng: 2.8 },
    ],
  }
})

describe('the area to cover', () => {
  it('downloads the perimeter as a GeoJSON polygon, named after the congregation', async () => {
    const response = await download()
    expect(response.headers.get('Content-Type')).toBe('application/geo+json')
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="zone les lilas.geojson"')
    const feature = await response.json()
    expect(feature.geometry.coordinates[0]).toEqual([
      [2.2, 48.2],
      [2.8, 48.2],
      [2.8, 48.8],
      [2.2, 48.2],
    ])
  })

  it('turns away an account that does not configure the territories', async () => {
    granted = new Set([Permission.CanViewTerritories])
    await expect(download()).rejects.toMatchObject({ status: 302 })
  })

  it('sends back to the settings while there is no area yet', async () => {
    mapArea = null
    await expect(download()).rejects.toMatchObject({ status: 302 })
  })
})
