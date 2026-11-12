import { describe, expect, it } from 'vitest'
import { areaAround, areaFeature, bboxesOverlap, reachAround, tileBbox, tilesCovering } from './map-area'

describe('areaAround', () => {
  it('has no area without a point', () => {
    expect(areaAround([])).toBeNull()
  })

  it('widens the rectangle around the points by a fifth of its size on each side', () => {
    const area = areaAround([
      { lat: 48.0, lng: 2.0 },
      { lat: 48.5, lng: 3.0 },
    ])
    expect(area?.swLat).toBeCloseTo(47.9)
    expect(area?.neLat).toBeCloseTo(48.6)
    expect(area?.swLng).toBeCloseTo(1.8)
    expect(area?.neLng).toBeCloseTo(3.2)
  })

  it('keeps about a kilometre around a lone building', () => {
    const area = areaAround([{ lat: 48.88, lng: 2.41 }])
    expect(area?.neLat).toBeCloseTo(48.89)
    expect(area?.swLat).toBeCloseTo(48.87)
    expect(area?.neLng).toBeCloseTo(2.425)
    expect(area?.swLng).toBeCloseTo(2.395)
  })
})

describe('reachAround', () => {
  const LES_LILAS = { swLat: 48.872, swLng: 2.405, neLat: 48.888, neLng: 2.43 }

  it('reaches about ten kilometres beyond the area, for drawing the perimeter wider', () => {
    const reach = reachAround(LES_LILAS)
    expect(reach.neLat - LES_LILAS.neLat).toBeCloseTo(0.0898, 3)
    expect(LES_LILAS.swLat - reach.swLat).toBeCloseTo(0.0898, 3)
    // A degree of longitude is shorter at 48.9° than at the equator: ten kilometres take more of them.
    expect(reach.neLng - LES_LILAS.neLng).toBeCloseTo(0.1366, 3)
    expect(LES_LILAS.swLng - reach.swLng).toBeCloseTo(0.1366, 3)
  })

  it('stays within the map', () => {
    expect(reachAround({ swLat: 84.9, swLng: 179.9, neLat: 85, neLng: 180 })).toMatchObject({
      neLat: 85.0511,
      neLng: 180,
    })
  })
})

describe('tileBbox', () => {
  it('covers the whole map at zoom 0', () => {
    const world = tileBbox(0, 0, 0)
    expect(world.swLng).toBeCloseTo(-180)
    expect(world.neLng).toBeCloseTo(180)
    expect(world.neLat).toBeCloseTo(85.0511)
    expect(world.swLat).toBeCloseTo(-85.0511)
  })

  it('splits it in four at zoom 1, the first tile in the north-west', () => {
    const tile = tileBbox(1, 0, 0)
    expect(tile.swLng).toBeCloseTo(-180)
    expect(tile.neLng).toBeCloseTo(0)
    expect(tile.swLat).toBeCloseTo(0)
    expect(tile.neLat).toBeCloseTo(85.0511)
  })

  it('places the tile of a street where the street is', () => {
    // Zoom 15 tile holding Les Lilas (48.88 N, 2.42 E)
    const tile = tileBbox(15, 16604, 11269)
    expect(tile.swLng).toBeLessThanOrEqual(2.42)
    expect(tile.neLng).toBeGreaterThanOrEqual(2.42)
    expect(tile.swLat).toBeLessThanOrEqual(48.88)
    expect(tile.neLat).toBeGreaterThanOrEqual(48.88)
    expect(tile.neLng - tile.swLng).toBeCloseTo(360 / 2 ** 15)
  })
})

describe('bboxesOverlap', () => {
  const area = { swLat: 48, swLng: 2, neLat: 49, neLng: 3 }

  it('says yes when the boxes share a part', () => {
    expect(bboxesOverlap(area, { swLat: 48.5, swLng: 2.5, neLat: 50, neLng: 4 })).toBe(true)
    expect(bboxesOverlap(area, { swLat: 0, swLng: 0, neLat: 80, neLng: 80 })).toBe(true)
  })

  it('says no when they are apart', () => {
    expect(bboxesOverlap(area, { swLat: 50, swLng: 2, neLat: 51, neLng: 3 })).toBe(false)
    expect(bboxesOverlap(area, { swLat: 48, swLng: 3.5, neLat: 49, neLng: 4 })).toBe(false)
  })
})

describe('areaFeature', () => {
  it('is the perimeter, closed, when the congregation drew one', () => {
    const feature = areaFeature({
      perimeter: [
        { lat: 48.0, lng: 2.0 },
        { lat: 48.0, lng: 3.0 },
        { lat: 49.0, lng: 3.0 },
      ],
      area: { swLat: 47, swLng: 1, neLat: 50, neLng: 4 },
    })
    expect(feature.geometry.coordinates).toEqual([
      [
        [2, 48],
        [3, 48],
        [3, 49],
        [2, 48],
      ],
    ])
  })

  it('is the rectangle of the area when there is no perimeter', () => {
    const feature = areaFeature({ perimeter: null, area: { swLat: 48, swLng: 2, neLat: 49, neLng: 3 } })
    expect(feature).toEqual({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2, 48],
            [3, 48],
            [3, 49],
            [2, 49],
            [2, 48],
          ],
        ],
      },
    })
  })
})

describe('tilesCovering', () => {
  it('lists the tiles of an area at a zoom, row by row', () => {
    // Les Lilas, about 1.5 km across: a handful of zoom-15 tiles
    const area = { swLat: 48.872, swLng: 2.405, neLat: 48.888, neLng: 2.43 }
    const tiles = tilesCovering(area, 15)
    expect(tiles.length).toBeGreaterThanOrEqual(4)
    expect(tiles.length).toBeLessThanOrEqual(12)
    expect(tiles).toContainEqual([16604, 11269])
    for (const [x, y] of tiles) expect(bboxesOverlap(area, tileBbox(15, x, y))).toBe(true)
  })

  it('needs one tile for the same area at zoom 10', () => {
    expect(tilesCovering({ swLat: 48.872, swLng: 2.405, neLat: 48.888, neLng: 2.43 }, 10)).toEqual([[518, 352]])
  })
})
