import { describe, expect, it } from 'vitest'
import { getMapArea } from './map-area.queries'

// The congregation's part of the map: its perimeter when it drew one, else the placed entrances. A fake client
// stands in for Prisma; RLS scoping is the caller's `withScope`.

type Extremes = { latitude: number | null; longitude: number | null }

function fakeDb({
  perimeter,
  min,
  max,
}: {
  perimeter: { lat: number; lng: number }[] | null
  min: Extremes
  max: Extremes
}) {
  return {
    territoryPerimeter: { findFirst: async () => (perimeter == null ? null : { id: 1, paths: perimeter }) },
    buildingEntrance: { aggregate: async () => ({ _min: min, _max: max }) },
  } as never
}

const NOTHING = { latitude: null, longitude: null }

describe('getMapArea', () => {
  it('follows the perimeter when the congregation drew one, and hands it back for the cut', async () => {
    const perimeter = [
      { lat: 48.0, lng: 2.0 },
      { lat: 48.0, lng: 3.0 },
      { lat: 48.5, lng: 3.0 },
    ]
    const result = await getMapArea(
      fakeDb({ perimeter, min: { latitude: 10, longitude: 10 }, max: { latitude: 11, longitude: 11 } }),
    )
    expect(result?.perimeter).toEqual(perimeter)
    expect(result?.area.swLat).toBeCloseTo(47.9)
    expect(result?.area.neLng).toBeCloseTo(3.2)
  })

  it('takes the placed entrances when there is no perimeter', async () => {
    const result = await getMapArea(
      fakeDb({ perimeter: null, min: { latitude: 48.0, longitude: 2.0 }, max: { latitude: 48.5, longitude: 3.0 } }),
    )
    expect(result?.perimeter).toBeNull()
    expect(result?.area.swLat).toBeCloseTo(47.9)
    expect(result?.area.neLat).toBeCloseTo(48.6)
    expect(result?.area.swLng).toBeCloseTo(1.8)
  })

  it('has no area while nothing is drawn or placed', async () => {
    expect(await getMapArea(fakeDb({ perimeter: null, min: NOTHING, max: NOTHING }))).toBeNull()
  })

  it('ignores a perimeter too small to be a shape', async () => {
    const result = await getMapArea(
      fakeDb({
        perimeter: [{ lat: 0, lng: 0 }],
        min: { latitude: 48.0, longitude: 2.0 },
        max: { latitude: 48.5, longitude: 3.0 },
      }),
    )
    expect(result?.perimeter).toBeNull()
    expect(result?.area.swLat).toBeCloseTo(47.9)
  })
})
