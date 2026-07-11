import { describe, expect, it } from 'vitest'
import { computeInitialCenter } from './use-card-overlay-editor'

const overlay = (id: number, lat: number, lng: number) => ({
  id,
  name: null,
  color: '#000000',
  paths: [{ lat, lng }],
})

const perimeter = (lat: number, lng: number) => ({
  paths: [{ lat, lng }],
})

describe('computeInitialCenter', () => {
  it('returns undefined when nothing is drawn yet', () => {
    expect(computeInitialCenter(null, null, null, [])).toBeUndefined()
  })

  it('centers on the perimeter when editing it', () => {
    expect(computeInitialCenter('edit', perimeter(1, 2), null, [])).toEqual({ lat: 1, lng: 2 })
  })

  it('prefers the overlay being edited over the perimeter', () => {
    expect(computeInitialCenter(null, perimeter(1, 2), overlay(1, 10, 20), [])).toEqual({ lat: 10, lng: 20 })
  })

  it('falls back to the perimeter when no overlay is being edited', () => {
    expect(computeInitialCenter(null, perimeter(1, 2), null, [])).toEqual({ lat: 1, lng: 2 })
  })

  it('falls back to the first overlay when no perimeter is set', () => {
    expect(computeInitialCenter(null, null, null, [overlay(5, 3, 4)])).toEqual({ lat: 3, lng: 4 })
  })
})
