import { describe, expect, it } from 'vitest'
import { Permission } from '~/shared/types/permission'
import { passesGate } from '~/tests/helpers/layout-gate'
import { routeContext } from '~/tests/helpers/route-action'
import { middleware as territoriesMiddleware } from './_layout'
import { middleware as prospectionMiddleware } from './prospection/_layout'
import { middleware as splitToolMiddleware } from './split-tool/_layout'

// The territory gates run as middleware so they cover every child's action, not only page loads.
describe('territories layout gate', () => {
  it.each([Permission.CanViewTerritories, Permission.CanViewProspection])('admits a caller with %s', async p => {
    expect(await passesGate(territoriesMiddleware, routeContext([p]))).toBe(true)
  })

  it('refuses a caller without a territory permission', async () => {
    expect(await passesGate(territoriesMiddleware, routeContext([Permission.CanViewPublishers]))).toBe(false)
  })
})

describe('prospection layout gate', () => {
  it('admits a caller who views prospection', async () => {
    expect(await passesGate(prospectionMiddleware, routeContext([Permission.CanViewProspection]))).toBe(true)
  })

  it('refuses a caller who does not', async () => {
    expect(await passesGate(prospectionMiddleware, routeContext([Permission.CanViewTerritories]))).toBe(false)
  })
})

describe('split-tool layout gate', () => {
  it('admits a caller who plans splits', async () => {
    expect(await passesGate(splitToolMiddleware, routeContext([Permission.CanPlanTerritorySplits]))).toBe(true)
  })

  it('refuses a caller who does not', async () => {
    expect(await passesGate(splitToolMiddleware, routeContext([Permission.CanViewTerritories]))).toBe(false)
  })
})
