import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'
import { passesGate } from '~/tests/helpers/layout-gate'
import { routeContext } from '~/tests/helpers/route-action'

vi.mock('~/shared/infra/db.server', () => ({
  withScope: (_congregationId: number, run: (db: unknown, congregationId: number) => unknown) => run({}, 1),
}))
vi.mock('~/features/events/index.server', () => ({ getResponsibleTemplateIds: vi.fn() }))

const { getResponsibleTemplateIds } = await import('~/features/events/index.server')
const { middleware } = await import('./_layout')

beforeEach(() => {
  vi.mocked(getResponsibleTemplateIds).mockResolvedValue([])
})

// The settings gate runs as middleware so it covers every child's action, not only page loads.
describe('settings layout gate', () => {
  it.each([
    Permission.CanManageUsers,
    Permission.CanViewUsers,
    Permission.CanConfigureCongregation,
    Permission.CanConfigurePermissions,
    Permission.CanSetPioneerGoals,
    Permission.CanManageProgramTemplates,
    Permission.CanManagePrograms,
    Permission.CanConfigureTerritorySettings,
    Permission.CanExportCongregationData,
  ])('admits a caller with %s', async permission => {
    expect(await passesGate(middleware, routeContext([permission]))).toBe(true)
  })

  it('admits a template responsible, whose role holds no settings right', async () => {
    vi.mocked(getResponsibleTemplateIds).mockResolvedValue([4])

    expect(await passesGate(middleware, routeContext([Permission.CanViewPrograms]))).toBe(true)
  })

  it('refuses a caller with none of the settings parts', async () => {
    expect(await passesGate(middleware, routeContext([Permission.CanViewPublishers, Permission.CanViewPrograms]))).toBe(
      false,
    )
  })
})
