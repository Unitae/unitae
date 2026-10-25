import { beforeEach, describe, expect, it, vi } from 'vitest'

// An import restores roles, their permissions, accounts and role assignments from the archive, so it
// can grant anything: only an admin may run one, whatever else the caller holds. Queued jobs are
// recorded in memory, so the tests assert on whether an import was started.

const { queued } = vi.hoisted(() => ({ queued: [] as string[] }))

vi.mock('~/features/settings/server/data-transfer-queue.server', () => ({
  dataTransferQueue: {
    add: vi.fn(async (_name: string, data: { storageKey: string }) => {
      queued.push(data.storageKey)
      return { id: 'job-1' }
    }),
  },
}))
vi.mock('~/features/settings/server/import-storage-key.server', () => ({ isOwnedImportKey: vi.fn(() => true) }))

const { Permission } = await import('~/shared/types/permission')
const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const { action } = await import('./import-confirm')

function confirm(permissions: (typeof Permission)[keyof typeof Permission][]) {
  return respond(() =>
    action({
      request: formRequest('https://unitae.example.test/settings/data/import/confirm', { storageKey: 'imports/1/a' }),
      params: {},
      context: routeContext(permissions),
    } as never),
  )
}

beforeEach(() => {
  queued.length = 0
})

describe('import-confirm action', () => {
  it('starts the import for an admin', async () => {
    // An admin's resolved permission set holds every permission.
    await confirm(Object.values(Permission))
    expect(queued).toEqual(['imports/1/a'])
  })

  it('refuses a caller who can import but is not an admin', async () => {
    const response = await confirm([Permission.CanImportCongregationData, Permission.CanConfigureCongregation])
    expect(response.headers.get('Location')).toBe('/')
    expect(queued).toEqual([])
  })
})
