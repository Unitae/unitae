import { describe, expect, it } from 'vitest'
import { Permission } from '~/shared/types/permission'
import { passesGate } from '~/tests/helpers/layout-gate'
import { routeContext } from '~/tests/helpers/route-action'
import { middleware } from './_layout'

// The publishers gate runs as middleware so it covers every child's action, not only page loads.
describe('publishers layout gate', () => {
  it.each([Permission.CanViewPublishers, Permission.CanViewPrograms, Permission.CanViewEmergencyInfo])(
    'admits a caller with %s',
    async permission => {
      expect(await passesGate(middleware, routeContext([permission]))).toBe(true)
    },
  )

  it('admits a group responsible without any publisher permission', async () => {
    const caller = { member: { id: 3, responsibleFor: { id: 9 }, deputyFor: null } }
    expect(await passesGate(middleware, routeContext([], caller))).toBe(true)
  })

  it('refuses a caller with neither a publisher permission nor a group role', async () => {
    expect(await passesGate(middleware, routeContext([Permission.CanViewBoard]))).toBe(false)
  })
})
