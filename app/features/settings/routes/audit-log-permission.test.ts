import { describe, expect, it, vi } from 'vitest'

// The settings layout admits callers holding any of several permissions, but the audit log is a
// congregation-administration page (the settings hub lists it under CanConfigureCongregation), so the
// page checks that permission itself.

vi.mock('~/features/settings/server/audit-log.server', () => ({
  findAuditLogsPaginated: vi.fn(async () => ({
    count: 1,
    page: 1,
    pageSize: 25,
    pages: 1,
    logs: [
      {
        id: 1,
        action: 'user.created',
        actorId: 7,
        actorEmail: 'admin@example.com',
        entityType: 'UserAccount',
        entityId: 2,
        metadata: null,
        createdAt: new Date('2026-10-01T10:00:00Z'),
        actorName: 'Ada Admin',
      },
    ],
  })),
}))

// The names are read from the database; the page only needs what they come back as.
vi.mock('~/features/settings/server/audit-entity-names.server', () => ({
  findAuditEntityNames: vi.fn(async () => new Map([['UserAccount:2', 'Bob BUILDER']])),
}))

const { Permission } = await import('~/shared/types/permission')
const { respond, routeContext } = await import('~/tests/helpers/route-action')
const { loader } = await import('./audit-log')

const request = new Request('https://unitae.example.test/settings/audit-log')

describe('audit-log loader', () => {
  it('shows the log to a caller who configures the congregation', async () => {
    const result = await loader({
      request,
      params: {},
      context: routeContext([Permission.CanConfigureCongregation]),
    } as never)

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].object).toBe('Compte · Bob BUILDER')
  })

  it('refuses a caller admitted to settings for another reason', async () => {
    const response = await respond(() =>
      loader({ request, params: {}, context: routeContext([Permission.CanManageUsers]) } as never),
    )

    expect(response.headers.get('Location')).toBe('/')
  })
})
