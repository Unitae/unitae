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
    vi.mocked(resolveEffectivePermissions).mockResolvedValue(new Set([Permission.CanDoAnything]))

    const result = await authenticateAndAuthorize(makeRequest(), [
      Permission.CanDoAnything,
      Permission.CanUploadBoardDocuments,
    ])

    expect(result.can(Permission.CanDoAnything)).toBe(true)
    expect(result.can(Permission.CanUploadBoardDocuments)).toBe(false)
  })

  it('returns false for a role that was not requested even when granted', async () => {
    vi.mocked(resolveEffectivePermissions).mockResolvedValue(new Set([Permission.CanViewTerritories]))

    const result = await authenticateAndAuthorize(makeRequest(), [Permission.CanDoAnything])

    expect(result.can(Permission.CanViewTerritories)).toBe(false)
  })

  it('works without roles', async () => {
    const result = await authenticateAndAuthorize(makeRequest())

    expect(result.can(Permission.CanDoAnything)).toBe(false)
  })
})
