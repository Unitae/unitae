import { describe, expect, it, vi } from 'vitest'
import { Permission } from '~/shared/types/permission'

// Deleting a role has two refusals the admin can act on, and both must arrive as a message.
//
// `deleteRole` throws ForbiddenError for a built-in role and ConflictError when organigram
// services still report to it. The action caught only the first, so the second escaped as an
// unhandled throw — a 500 page instead of « déplacez-les avant de supprimer ce rôle ».

const currentAccountContext = Symbol('currentAccountContext')
const permissionsContext = Symbol('permissionsContext')

const deleteRole = vi.fn()
const flash = vi.fn()

vi.mock('~/shared/auth/route-context.server', () => ({
  currentAccountContext,
  permissionsContext,
  withScopeFromContext: (_context: unknown, fn: (db: unknown) => unknown) => fn({}),
}))

vi.mock('~/features/authentication/index.server', () => ({
  getSession: vi.fn().mockResolvedValue({ flash }),
  commitSession: vi.fn().mockResolvedValue('cookie'),
}))

vi.mock('~/shared/domain/roles.server', () => ({ deleteRole }))

const { action } = await import('./delete-role')
const { ConflictError, ForbiddenError } = await import('~/shared/errors/app-error.server')

function args() {
  return {
    params: { roleId: '7' },
    request: new Request('http://localhost/congregation/roles/7/delete', { method: 'POST' }),
    context: {
      get: (key: symbol) =>
        key === permissionsContext ? new Set([Permission.CanManageRoles]) : { id: 1, congregationId: 1 },
    },
  } as never
}

describe('delete-role action', () => {
  it('surfaces the organigram conflict as a message rather than crashing', async () => {
    const message = 'Des services de l’organigramme lui sont rattachés : Sono.'
    deleteRole.mockRejectedValueOnce(new ConflictError(message))

    await expect(action(args())).resolves.toBeDefined()
    expect(flash).toHaveBeenCalledWith('error', message)
  })

  it('still reports a built-in role as undeletable', async () => {
    deleteRole.mockRejectedValueOnce(new ForbiddenError('Built-in roles cannot be deleted'))

    await expect(action(args())).resolves.toBeDefined()
    expect(flash).toHaveBeenCalledWith('error', expect.any(String))
  })

  it('lets a genuine fault through rather than reporting it as a refusal', async () => {
    // A dropped connection is not something the admin can act on, and swallowing it here would
    // report the role as un-deletable for a reason that has nothing to do with the role.
    deleteRole.mockRejectedValueOnce(new Error('connection terminated'))

    await expect(action(args())).rejects.toThrow('connection terminated')
  })
})
