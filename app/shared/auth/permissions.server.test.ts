import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    congregationUserPermission: { findMany: vi.fn() },
    rolePermission: { findMany: vi.fn() },
  },
}))

const { resolveEffectivePermissions } = await import('./permissions.server')
const { unscopedDb } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('resolveEffectivePermissions', () => {
  it('returns the union of direct grants and role-mediated grants', async () => {
    vi.mocked(unscopedDb.congregationUserPermission.findMany).mockResolvedValue([
      { permission: { key: 'territories-manager' } },
    ] as never)
    vi.mocked(unscopedDb.rolePermission.findMany).mockResolvedValue([
      { permission: { key: 'publisher-viewer' } },
    ] as never)

    const result = await resolveEffectivePermissions(42, 1)

    expect(result).toEqual(new Set(['territories-manager', 'publisher-viewer']))
  })

  it('deduplicates when the same permission is granted directly and via a role', async () => {
    vi.mocked(unscopedDb.congregationUserPermission.findMany).mockResolvedValue([
      { permission: { key: 'admin' } },
    ] as never)
    vi.mocked(unscopedDb.rolePermission.findMany).mockResolvedValue([{ permission: { key: 'admin' } }] as never)

    const result = await resolveEffectivePermissions(42, 1)

    expect([...result]).toEqual(['admin'])
  })

  it('returns an empty set when the user has no grants', async () => {
    vi.mocked(unscopedDb.congregationUserPermission.findMany).mockResolvedValue([] as never)
    vi.mocked(unscopedDb.rolePermission.findMany).mockResolvedValue([] as never)

    const result = await resolveEffectivePermissions(42, 1)

    expect(result.size).toBe(0)
  })

  it('scopes both queries to the requested congregation', async () => {
    vi.mocked(unscopedDb.congregationUserPermission.findMany).mockResolvedValue([] as never)
    vi.mocked(unscopedDb.rolePermission.findMany).mockResolvedValue([] as never)

    await resolveEffectivePermissions(42, 7)

    expect(unscopedDb.congregationUserPermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 42, congregationId: 7 }) }),
    )
    expect(unscopedDb.rolePermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          congregationId: 7,
          role: { members: { some: { userId: 42 } } },
        }),
      }),
    )
  })
})
