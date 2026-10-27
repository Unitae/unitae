import { describe, expect, it } from 'vitest'
import { EntranceKind } from './entrance-kind.type'
import { getTerritoryPmrStatus } from './pmr-status'
import { TerritoryKindKey } from './territory-kind.type'

const residential = (isPMR: boolean | null) => ({ kind: EntranceKind.Residential, isPMR })

describe('getTerritoryPmrStatus', () => {
  it('returns full when every residential entrance is PMR', () => {
    expect(getTerritoryPmrStatus(TerritoryKindKey.Classical, [residential(true), residential(true)])).toBe('full')
  })

  it('returns partial when some but not all residential entrances are PMR', () => {
    expect(getTerritoryPmrStatus(TerritoryKindKey.Classical, [residential(true), residential(false)])).toBe('partial')
  })

  it('returns not when no residential entrance is PMR', () => {
    expect(getTerritoryPmrStatus(TerritoryKindKey.Classical, [residential(false), residential(false)])).toBe('not')
  })

  it('counts an unknown (null) entrance as not PMR', () => {
    expect(getTerritoryPmrStatus(TerritoryKindKey.Classical, [residential(true), residential(null)])).toBe('partial')
    expect(getTerritoryPmrStatus(TerritoryKindKey.Classical, [residential(null)])).toBe('not')
  })

  it('ignores non-residential entrances', () => {
    const entrances = [residential(true), { kind: EntranceKind.Commerce, isPMR: false }]
    expect(getTerritoryPmrStatus(TerritoryKindKey.Classical, entrances)).toBe('full')
  })

  it('returns null for a territory without residential entrances', () => {
    expect(getTerritoryPmrStatus(TerritoryKindKey.Classical, [])).toBeNull()
    expect(getTerritoryPmrStatus(TerritoryKindKey.Classical, [{ kind: EntranceKind.Commerce, isPMR: true }])).toBeNull()
  })

  it('returns null for territories that are not door-to-door', () => {
    expect(getTerritoryPmrStatus(TerritoryKindKey.Commerces, [residential(true)])).toBeNull()
    expect(getTerritoryPmrStatus(TerritoryKindKey.Phone, [residential(true)])).toBeNull()
  })
})
