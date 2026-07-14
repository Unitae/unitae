import { describe, expect, it } from 'vitest'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { parseEntrancesInBboxParams } from './entrances-in-bbox-params'

const wideBbox = '48.0,2.0,49.0,3.0'

describe('parseEntrancesInBboxParams — edit mode (default)', () => {
  it('parses a valid bbox + territoryId when no mode is provided', () => {
    const params = new URLSearchParams({ bbox: wideBbox, territoryId: '42' })
    const result = parseEntrancesInBboxParams(params)
    expect(result).toEqual({
      mode: 'edit',
      bbox: { swLat: 48, swLng: 2, neLat: 49, neLng: 3 },
      territoryId: 42,
    })
  })

  it('rejects an empty bbox', () => {
    const params = new URLSearchParams({ territoryId: '42' })
    expect(parseEntrancesInBboxParams(params)).toBeNull()
  })

  it('rejects a bbox that is not four floats', () => {
    const params = new URLSearchParams({ bbox: '48,2,49', territoryId: '42' })
    expect(parseEntrancesInBboxParams(params)).toBeNull()
  })

  it('rejects a non-positive territoryId', () => {
    const params = new URLSearchParams({ bbox: wideBbox, territoryId: '0' })
    expect(parseEntrancesInBboxParams(params)).toBeNull()
  })

  it('rejects a non-numeric territoryId', () => {
    const params = new URLSearchParams({ bbox: wideBbox, territoryId: 'abc' })
    expect(parseEntrancesInBboxParams(params)).toBeNull()
  })
})

describe('parseEntrancesInBboxParams — create mode', () => {
  it('parses a valid bbox + TerritoryKind', () => {
    const params = new URLSearchParams({ bbox: wideBbox, mode: 'create', kind: TerritoryKind.Commerces })
    const result = parseEntrancesInBboxParams(params)
    expect(result).toEqual({
      mode: 'create',
      bbox: { swLat: 48, swLng: 2, neLat: 49, neLng: 3 },
      kind: TerritoryKind.Commerces,
    })
  })

  it('rejects a missing kind', () => {
    const params = new URLSearchParams({ bbox: wideBbox, mode: 'create' })
    expect(parseEntrancesInBboxParams(params)).toBeNull()
  })

  it('rejects an unknown kind', () => {
    const params = new URLSearchParams({ bbox: wideBbox, mode: 'create', kind: 'BOGUS' })
    expect(parseEntrancesInBboxParams(params)).toBeNull()
  })

  it('rejects an unknown mode', () => {
    const params = new URLSearchParams({ bbox: wideBbox, mode: 'delete', kind: TerritoryKind.Commerces })
    expect(parseEntrancesInBboxParams(params)).toBeNull()
  })

  it('rejects an empty bbox even when mode + kind are valid', () => {
    const params = new URLSearchParams({ mode: 'create', kind: TerritoryKind.Commerces })
    expect(parseEntrancesInBboxParams(params)).toBeNull()
  })

  it('ignores territoryId when mode is create', () => {
    const params = new URLSearchParams({
      bbox: wideBbox,
      mode: 'create',
      kind: TerritoryKind.Hotel,
      territoryId: '999',
    })
    const result = parseEntrancesInBboxParams(params)
    expect(result).toEqual({
      mode: 'create',
      bbox: { swLat: 48, swLng: 2, neLat: 49, neLng: 3 },
      kind: TerritoryKind.Hotel,
    })
  })
})
