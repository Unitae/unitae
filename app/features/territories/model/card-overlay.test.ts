import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildGeoJsonExport,
  type CardOverlay,
  cardOverlayPathsSchema,
  GeoJsonValidationError,
  parseGeoJsonImport,
} from './card-overlay'

const lyonFixture = JSON.parse(readFileSync(join(__dirname, '__fixtures__/lyon-overlays.geojson'), 'utf8'))

describe('cardOverlayPathsSchema', () => {
  it('accepte un anneau déjà fermé', () => {
    const result = cardOverlayPathsSchema.parse([
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
      { lat: 1, lng: 1 },
    ])
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual(result[3])
  })

  it('ferme automatiquement un anneau ouvert', () => {
    const result = cardOverlayPathsSchema.parse([
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ])
    expect(result).toHaveLength(4)
    expect(result[3]).toEqual({ lat: 1, lng: 1 })
  })

  it('refuse moins de 3 sommets', () => {
    const result = cardOverlayPathsSchema.safeParse([
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
    ])
    expect(result.success).toBe(false)
  })

  it('refuse une latitude hors plage', () => {
    const result = cardOverlayPathsSchema.safeParse([
      { lat: 95, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ])
    expect(result.success).toBe(false)
  })
})

const MULTIPLE_PERIMETERS_PATTERN = /plusieurs périmètres/
const PERIMETER_MUST_BE_POLYGON_PATTERN = /Polygon/

describe('parseGeoJsonImport', () => {
  it('importe les trois polygones du fixture Lyon en tant que zones', () => {
    const { zones, perimeter } = parseGeoJsonImport(lyonFixture)
    expect(perimeter).toBeNull()
    expect(zones).toHaveLength(3)
    expect(zones.map(z => z.name)).toEqual(['Zone rose', 'Zone verte', 'Zone bleue'])
    expect(zones.map(z => z.color)).toEqual(['#C2175B', '#0E9A6C', '#2289BC'])
    // Pink polygon: 27 points after closing, swapped from the static-map URL
    expect(zones[0].paths).toHaveLength(27)
    expect(zones[0].paths[0]).toEqual({ lat: 45.7511927, lng: 4.8229874 })
  })

  it('accepte un Feature unique sans FeatureCollection', () => {
    const single = lyonFixture.features[0]
    const { zones, perimeter } = parseGeoJsonImport(single)
    expect(perimeter).toBeNull()
    expect(zones).toHaveLength(1)
    expect(zones[0].name).toBe('Zone rose')
  })

  it('expanse un MultiPolygon en plusieurs overlays partageant nom + couleur', () => {
    const multi = {
      type: 'Feature',
      properties: { name: 'Multi', color: '#123456' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 1],
              [2, 0],
              [0, 0],
            ],
          ],
          [
            [
              [10, 10],
              [11, 11],
              [12, 10],
              [10, 10],
            ],
          ],
        ],
      },
    }
    const { zones } = parseGeoJsonImport(multi)
    expect(zones).toHaveLength(2)
    expect(zones.every(z => z.name === 'Multi' && z.color === '#123456')).toBe(true)
  })

  it('utilise une couleur par défaut quand aucune n’est fournie', () => {
    const { zones } = parseGeoJsonImport({
      type: 'Feature',
      properties: { name: 'Sans couleur' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [2, 0],
            [0, 0],
          ],
        ],
      },
    })
    expect(zones[0].color).toBe('#C2175B')
  })

  it('rejette un GeoJSON sans polygones', () => {
    expect(() => parseGeoJsonImport({ type: 'Point', coordinates: [0, 0] })).toThrow(GeoJsonValidationError)
  })

  it('rejette un GeoJSON malformé', () => {
    expect(() => parseGeoJsonImport({ type: 'Feature' })).toThrow(GeoJsonValidationError)
  })

  it('reconnaît une feature de rôle "perimeter" et la sépare des zones', () => {
    const collection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { role: 'perimeter' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 1],
                [2, 0],
                [0, 0],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { name: 'Zone A', color: '#C2175B' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [10, 10],
                [11, 11],
                [12, 10],
                [10, 10],
              ],
            ],
          },
        },
      ],
    }
    const { zones, perimeter } = parseGeoJsonImport(collection)
    expect(perimeter).not.toBeNull()
    expect(perimeter).toHaveLength(4)
    expect(perimeter?.[0]).toEqual({ lat: 0, lng: 0 })
    expect(zones).toHaveLength(1)
    expect(zones[0].name).toBe('Zone A')
  })

  it('rejette un fichier contenant plusieurs périmètres', () => {
    const collection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { role: 'perimeter' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 1],
                [2, 0],
                [0, 0],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { role: 'perimeter' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [10, 10],
                [11, 11],
                [12, 10],
                [10, 10],
              ],
            ],
          },
        },
      ],
    }
    expect(() => parseGeoJsonImport(collection)).toThrow(MULTIPLE_PERIMETERS_PATTERN)
  })

  it('rejette un périmètre fourni en MultiPolygon', () => {
    const feature = {
      type: 'Feature',
      properties: { role: 'perimeter' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [1, 1],
              [2, 0],
              [0, 0],
            ],
          ],
          [
            [
              [10, 10],
              [11, 11],
              [12, 10],
              [10, 10],
            ],
          ],
        ],
      },
    }
    expect(() => parseGeoJsonImport(feature)).toThrow(PERIMETER_MUST_BE_POLYGON_PATTERN)
  })
})

describe('buildGeoJsonExport', () => {
  it('round-trip : import puis export reconstruit les mêmes polygones', () => {
    const { zones } = parseGeoJsonImport(lyonFixture)
    const overlays: CardOverlay[] = zones.map((draft, index) => ({ id: index + 1, ...draft }))
    const collection = buildGeoJsonExport(overlays)

    const reimported = parseGeoJsonImport(collection)
    expect(reimported.zones).toHaveLength(zones.length)
    expect(reimported.perimeter).toBeNull()
    for (let i = 0; i < zones.length; i++) {
      expect(reimported.zones[i].name).toBe(zones[i].name)
      expect(reimported.zones[i].color).toBe(zones[i].color)
      expect(reimported.zones[i].paths).toEqual(zones[i].paths)
    }
  })

  it('inclut le périmètre avec properties.role = "perimeter"', () => {
    const perimeterPaths = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 2, lng: 0 },
      { lat: 0, lng: 0 },
    ]
    const collection = buildGeoJsonExport([], perimeterPaths)
    expect(collection.features).toHaveLength(1)
    expect(collection.features[0].properties).toEqual({ role: 'perimeter' })
  })

  it('round-trip avec périmètre + zones', () => {
    const perimeterPaths = [
      { lat: 0, lng: 0 },
      { lat: 5, lng: 0 },
      { lat: 5, lng: 5 },
      { lat: 0, lng: 0 },
    ]
    const overlays: CardOverlay[] = [
      {
        id: 1,
        name: 'Zone A',
        color: '#C2175B',
        paths: [
          { lat: 1, lng: 1 },
          { lat: 2, lng: 1 },
          { lat: 2, lng: 2 },
          { lat: 1, lng: 1 },
        ],
      },
    ]
    const collection = buildGeoJsonExport(overlays, perimeterPaths)
    const reimported = parseGeoJsonImport(collection)
    expect(reimported.perimeter).toEqual(perimeterPaths)
    expect(reimported.zones).toHaveLength(1)
    expect(reimported.zones[0].name).toBe('Zone A')
  })

  it('omet le périmètre quand il est invalide (moins de 3 sommets)', () => {
    const collection = buildGeoJsonExport(
      [],
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
      ],
    )
    expect(collection.features).toHaveLength(0)
  })
})
