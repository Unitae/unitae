import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Permission } from '~/shared/types/permission'

vi.mock('~/features/authentication/server/session.server', () => ({
  verifySession: vi.fn(),
}))

vi.mock('~/shared/auth/permissions.server', () => ({
  resolveEffectivePermissions: vi.fn(),
}))

const { authenticateAndAuthorize } = await import('./auth.server')
const { verifySession } = await import('~/features/authentication/server/session.server')
const { resolveEffectivePermissions } = await import('~/shared/auth/permissions.server')

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
  vi.mocked(resolveEffectivePermissions).mockResolvedValue(new Set())
})

describe('authenticateAndAuthorize', () => {
  it('returns the data from verifySession', async () => {
    const result = await authenticateAndAuthorize(makeRequest())

    expect(result.currentUser).toBe(fakeSessionResult.currentUser)
    expect(result.congregation).toBe(fakeSessionResult.congregation)
    expect(result.session).toBe(fakeSessionResult.session)
  })

  it('returns congregationId from currentUser', async () => {
    const result = await authenticateAndAuthorize(makeRequest())

    expect(result.congregationId).toBe(5)
  })

  it('grants only requested roles that the user actually holds', async () => {
    vi.mocked(resolveEffectivePermissions).mockResolvedValue(new Set([Permission.Admin]))

    const result = await authenticateAndAuthorize(makeRequest(), [Permission.Admin, Permission.BoardUploader])

    expect(result.can(Permission.Admin)).toBe(true)
    expect(result.can(Permission.BoardUploader)).toBe(false)
  })

  it('returns false for a role that was not requested even when granted', async () => {
    vi.mocked(resolveEffectivePermissions).mockResolvedValue(new Set([Permission.TerritoriesViewer]))

    const result = await authenticateAndAuthorize(makeRequest(), [Permission.Admin])

    expect(result.can(Permission.TerritoriesViewer)).toBe(false)
  })

  it('works without roles', async () => {
    const result = await authenticateAndAuthorize(makeRequest())

    expect(result.can(Permission.Admin)).toBe(false)
  })
})
