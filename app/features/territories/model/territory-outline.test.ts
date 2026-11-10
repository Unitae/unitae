import { describe, expect, it } from 'vitest'

import { territoryOutline } from './territory-outline'

describe('territoryOutline', () => {
  it('keeps the corners and leaves out the points inside', () => {
    const outline = territoryOutline([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
      { lat: 1, lng: 1 },
    ])

    expect(outline).toHaveLength(4)
    expect(outline).not.toContainEqual({ lat: 1, lng: 1 })
  })

  it('draws nothing under three distinct points, or for points in a line', () => {
    expect(
      territoryOutline([
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 1, lng: 1 },
      ]),
    ).toEqual([])
    expect(
      territoryOutline([
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ]),
    ).toEqual([])
  })
})
