import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type CardOverlay,
  cardOverlayPathsSchema,
  cardOverlaysToGeoJson,
  GeoJsonValidationError,
  geoJsonToCardOverlays,
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

describe('geoJsonToCardOverlays', () => {
  it('importe les trois polygones du fixture Lyon', () => {
    const drafts = geoJsonToCardOverlays(lyonFixture)
    expect(drafts).toHaveLength(3)
    expect(drafts.map(d => d.name)).toEqual(['Zone rose', 'Zone verte', 'Zone bleue'])
    expect(drafts.map(d => d.color)).toEqual(['#C2175B', '#0E9A6C', '#2289BC'])
    // Pink polygon: 27 points after closing, swapped from the static-map URL
    expect(drafts[0].paths).toHaveLength(27)
    expect(drafts[0].paths[0]).toEqual({ lat: 45.7511927, lng: 4.8229874 })
  })

  it('accepte un Feature unique sans FeatureCollection', () => {
    const single = lyonFixture.features[0]
    const drafts = geoJsonToCardOverlays(single)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].name).toBe('Zone rose')
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
    const drafts = geoJsonToCardOverlays(multi)
    expect(drafts).toHaveLength(2)
    expect(drafts.every(d => d.name === 'Multi' && d.color === '#123456')).toBe(true)
  })

  it('utilise une couleur par défaut quand aucune n’est fournie', () => {
    const drafts = geoJsonToCardOverlays({
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
    expect(drafts[0].color).toBe('#C2175B')
  })

  it('rejette un GeoJSON sans polygones', () => {
    expect(() => geoJsonToCardOverlays({ type: 'Point', coordinates: [0, 0] })).toThrow(GeoJsonValidationError)
  })

  it('rejette un GeoJSON malformé', () => {
    expect(() => geoJsonToCardOverlays({ type: 'Feature' })).toThrow(GeoJsonValidationError)
  })
})

describe('cardOverlaysToGeoJson', () => {
  it('round-trip : import puis export reconstruit les mêmes polygones', () => {
    const drafts = geoJsonToCardOverlays(lyonFixture)
    const overlays: CardOverlay[] = drafts.map((draft, index) => ({ id: index + 1, ...draft }))
    const collection = cardOverlaysToGeoJson(overlays)

    const reimported = geoJsonToCardOverlays(collection)
    expect(reimported).toHaveLength(drafts.length)
    for (let i = 0; i < drafts.length; i++) {
      expect(reimported[i].name).toBe(drafts[i].name)
      expect(reimported[i].color).toBe(drafts[i].color)
      expect(reimported[i].paths).toEqual(drafts[i].paths)
    }
  })
})
