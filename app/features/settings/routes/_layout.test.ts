import { describe, expect, it } from 'vitest'
import { Permission } from '~/shared/types/permission'
import { passesGate } from '~/tests/helpers/layout-gate'
import { routeContext } from '~/tests/helpers/route-action'
import { middleware } from './_layout'

// The settings gate runs as middleware so it covers every child's action, not only page loads.
describe('settings layout gate', () => {
  it.each([
    Permission.CanManageUsers,
    Permission.CanConfigureCongregation,
    Permission.CanConfigurePermissions,
    Permission.CanSetPioneerGoals,
  ])('admits a caller with %s', async permission => {
    expect(await passesGate(middleware, routeContext([permission]))).toBe(true)
  })

  it('refuses a caller with none of the settings permissions', async () => {
    expect(await passesGate(middleware, routeContext([Permission.CanViewPublishers]))).toBe(false)
  })
})
