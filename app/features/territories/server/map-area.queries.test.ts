import { describe, expect, it } from 'vitest'
import { getMapArea } from './map-area.queries'

// The congregation's part of the map: its perimeter and its placed entrances together, so that every entrance can be
// reached on a map. A fake client stands in for Prisma; RLS scoping is the caller's `withScope`.

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
  it('follows the perimeter when the entrances lie within it, and hands it back for the cut', async () => {
    const perimeter = [
      { lat: 48.0, lng: 2.0 },
      { lat: 48.0, lng: 3.0 },
      { lat: 48.5, lng: 3.0 },
    ]
    const result = await getMapArea(
      fakeDb({ perimeter, min: { latitude: 48.1, longitude: 2.4 }, max: { latitude: 48.3, longitude: 2.9 } }),
    )
    expect(result?.perimeter).toEqual(perimeter)
    expect(result?.area.swLat).toBeCloseTo(47.9)
    expect(result?.area.neLng).toBeCloseTo(3.2)
  })

  it('reaches the entrances placed beyond the perimeter, and then cuts to the rectangle', async () => {
    const perimeter = [
      { lat: 48.0, lng: 2.0 },
      { lat: 48.0, lng: 3.0 },
      { lat: 48.5, lng: 3.0 },
    ]
    const result = await getMapArea(
      fakeDb({ perimeter, min: { latitude: 48.1, longitude: 2.4 }, max: { latitude: 49.0, longitude: 3.5 } }),
    )
    // 48.0 → 49.0 and 2.0 → 3.5, each widened by a fifth.
    expect(result?.area.neLat).toBeCloseTo(49.2)
    expect(result?.area.neLng).toBeCloseTo(3.8)
    expect(result?.area.swLat).toBeCloseTo(47.8)
    expect(result?.perimeter).toBeNull()
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
