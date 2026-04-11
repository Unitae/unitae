import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Role } from '~/features/authorization/model/roles.type'

vi.mock('~/features/authentication/server/session.server', () => ({
  verifySession: vi.fn(),
}))

vi.mock('~/features/authorization/server/verify-role.server', () => ({
  verifyRole: vi.fn(),
}))

const { authenticateAndAuthorize } = await import('./auth.server')
const { verifySession } = await import('~/features/authentication/server/session.server')
const { verifyRole } = await import('~/features/authorization/server/verify-role.server')

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

  it('résout les permissions via verifyRole', async () => {
    vi.mocked(verifyRole).mockImplementation((_req, role) => {
      return Promise.resolve(role === Role.Admin)
    })

    const result = await authenticateAndAuthorize(makeRequest(), [Role.Admin, Role.BoardUploader])

    expect(result.can(Role.Admin)).toBe(true)
    expect(result.can(Role.BoardUploader)).toBe(false)
  })

  it('retourne false pour un rôle non demandé', async () => {
    vi.mocked(verifyRole).mockResolvedValue(true as never)

    const result = await authenticateAndAuthorize(makeRequest(), [Role.Admin])

    expect(result.can(Role.TerritoriesViewer)).toBe(false)
  })

  it('fonctionne sans rôles', async () => {
    const result = await authenticateAndAuthorize(makeRequest())

    expect(verifyRole).not.toHaveBeenCalled()
    expect(result.can(Role.Admin)).toBe(false)
  })
})
