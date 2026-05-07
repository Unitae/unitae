import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Permission } from '~/shared/types/permission'

vi.mock('~/features/authentication/server/session.server', () => ({
  verifySession: vi.fn(),
}))

vi.mock('~/shared/auth/permissions.server', () => ({
  verifyPermission: vi.fn(),
}))

const { authenticateAndAuthorize } = await import('./auth.server')
const { verifySession } = await import('~/features/authentication/server/session.server')
const { verifyPermission } = await import('~/shared/auth/permissions.server')

function makeRequest() {
  return new Request('http://localhost/')
}

const fakeSessionResult = {
  currentUser: { id: 1, congregationId: 5, firstname: 'Test', lastname: 'User' },
  congregation: { id: 5, name: 'Test', slug: 'test' },
  session: {},
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(verifySession).mockResolvedValue(fakeSessionResult as never)
})

describe('authenticateAndAuthorize', () => {
  it('retourne les données de verifySession', async () => {
    const result = await authenticateAndAuthorize(makeRequest())

    expect(result.currentUser).toBe(fakeSessionResult.currentUser)
    expect(result.congregation).toBe(fakeSessionResult.congregation)
    expect(result.session).toBe(fakeSessionResult.session)
  })

  it('retourne congregationId from currentUser', async () => {
    const result = await authenticateAndAuthorize(makeRequest())

    expect(result.congregationId).toBe(5)
  })

  it('résout les permissions via verifyPermission', async () => {
    vi.mocked(verifyPermission).mockImplementation((_req, role) => {
      return Promise.resolve(role === Permission.Admin)
    })

    const result = await authenticateAndAuthorize(makeRequest(), [Permission.Admin, Permission.BoardUploader])

    expect(result.can(Permission.Admin)).toBe(true)
    expect(result.can(Permission.BoardUploader)).toBe(false)
  })

  it('retourne false pour un rôle non demandé', async () => {
    vi.mocked(verifyPermission).mockResolvedValue(true as never)

    const result = await authenticateAndAuthorize(makeRequest(), [Permission.Admin])

    expect(result.can(Permission.TerritoriesViewer)).toBe(false)
  })

  it('fonctionne sans rôles', async () => {
    const result = await authenticateAndAuthorize(makeRequest())

    expect(verifyPermission).not.toHaveBeenCalled()
    expect(result.can(Permission.Admin)).toBe(false)
  })
})
