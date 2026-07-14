import { describe, expect, it } from 'vitest'
import { cardOverlayPathToTerraDrawRing, terraDrawRingToCardOverlayPath } from './card-overlay-map-bridge'

// Sentinel coordinates: real-world lat/lng picked to avoid accidental axis-swap symmetry.
const A = { lat: 48.8566, lng: 2.3522 }
const B = { lat: 45.764, lng: 4.8357 }
const C = { lat: 43.2965, lng: 5.3698 }

describe('terraDrawRingToCardOverlayPath', () => {
  it('strips the closing point when the ring is closed and swaps [lng, lat] to {lat, lng}', () => {
    const closedRing: [number, number][] = [
      [A.lng, A.lat],
      [B.lng, B.lat],
      [C.lng, C.lat],
      [A.lng, A.lat],
    ]

    expect(terraDrawRingToCardOverlayPath(closedRing)).toEqual([A, B, C])
  })

  it('passes an open ring through unchanged (minus axis swap)', () => {
    const openRing: [number, number][] = [
      [A.lng, A.lat],
      [B.lng, B.lat],
      [C.lng, C.lat],
    ]

    expect(terraDrawRingToCardOverlayPath(openRing)).toEqual([A, B, C])
  })

  it('returns an empty array for an empty ring', () => {
    expect(terraDrawRingToCardOverlayPath([])).toEqual([])
  })

  it('returns an empty array for a degenerate single-point closed ring', () => {
    const degenerate: [number, number][] = [
      [A.lng, A.lat],
      [A.lng, A.lat],
    ]

    expect(terraDrawRingToCardOverlayPath(degenerate)).toEqual([])
  })

  it('preserves 9-decimal coordinate precision through the round trip', () => {
    const precise = { lat: 48.856612345, lng: 2.352212345 }
    const ring: [number, number][] = [
      [precise.lng, precise.lat],
      [B.lng, B.lat],
      [C.lng, C.lat],
      [precise.lng, precise.lat],
    ]

    const result = terraDrawRingToCardOverlayPath(ring)
    expect(result[0].lat).toBeCloseTo(precise.lat, 9)
    expect(result[0].lng).toBeCloseTo(precise.lng, 9)
  })
})

describe('cardOverlayPathToTerraDrawRing', () => {
  it('appends the closing point and swaps {lat, lng} to [lng, lat] when input is not closed', () => {
    expect(cardOverlayPathToTerraDrawRing([A, B, C])).toEqual([
      [A.lng, A.lat],
      [B.lng, B.lat],
      [C.lng, C.lat],
      [A.lng, A.lat],
    ])
  })

  it('does not double-close when the input is already closed', () => {
    const result = cardOverlayPathToTerraDrawRing([A, B, C, A])
    expect(result).toHaveLength(4)
    expect(result).toEqual([
      [A.lng, A.lat],
      [B.lng, B.lat],
      [C.lng, C.lat],
      [A.lng, A.lat],
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(cardOverlayPathToTerraDrawRing([])).toEqual([])
  })

  it('emits [lng, lat] not [lat, lng] for a single-point input', () => {
    // Single-point input can't produce a valid ring — but the axis order must be correct
    // for any point regardless of ring validity. Guards against a silent axis-swap bug.
    const point = { lat: 48.85, lng: 2.35 }
    const result = cardOverlayPathToTerraDrawRing([point])
    expect(result[0]).toEqual([2.35, 48.85])
  })
})

describe('round trip', () => {
  it('terraDrawRingToCardOverlayPath ∘ cardOverlayPathToTerraDrawRing is identity for paths of length >= 3', () => {
    const original = [A, B, C]

    expect(terraDrawRingToCardOverlayPath(cardOverlayPathToTerraDrawRing(original))).toEqual(original)
  })
})
