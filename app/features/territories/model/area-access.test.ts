import { describe, expect, it } from 'vitest'

import { Permission } from '~/shared/types/permission'

import { canEnterTerritoriesArea } from './area-access'

describe('canEnterTerritoriesArea', () => {
  it('admits the territory and prospection viewers', () => {
    expect(canEnterTerritoriesArea(new Set([Permission.CanViewTerritories]))).toBe(true)
    expect(canEnterTerritoriesArea(new Set([Permission.CanViewProspection]))).toBe(true)
  })

  it('turns away an attribution right that comes without a territory view', () => {
    expect(canEnterTerritoriesArea(new Set([Permission.CanViewTerritoryAttributions]))).toBe(false)
  })
})
