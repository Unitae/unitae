import { describe, expect, it } from 'vitest'

import { type MapState, mapStateAfter } from './map-state'

describe('mapStateAfter', () => {
  it('turns ready once the map has drawn', () => {
    expect(mapStateAfter('loading', 'ready')).toBe('ready')
  })

  it('turns failed when a base tile fails', () => {
    expect(mapStateAfter('loading', 'failed')).toBe('failed')
    expect(mapStateAfter('ready', 'failed')).toBe('failed')
  })

  it('stays failed when the map goes idle after the tiles failed on first load', () => {
    // MapLibre reports the tile errors first, then goes idle: idle must not hide the failure.
    let state: MapState = 'loading'
    state = mapStateAfter(state, 'failed')
    state = mapStateAfter(state, 'ready')
    expect(state).toBe('failed')
  })

  it('starts over on retry', () => {
    expect(mapStateAfter('failed', 'retry')).toBe('loading')
  })
})
