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
vi.mock('~/features/settings/server/import-congregation.server', () => ({ validateImport: vi.fn() }))
vi.mock('~/shared/infra/file-storage.server', () => ({
  buildStorageKey: (congregationId: number, feature: string, filename: string) =>
    `${congregationId}/${feature}/${filename}`,
  uploadFile: vi.fn(),
}))

const { Permission } = await import('~/shared/types/permission')
const { formRequest, respond, routeContext } = await import('~/tests/helpers/route-action')
const { action } = await import('./settings')

const ARCHIVE = '6f1c2b0e-8d4a-4e8b-9c3f-1a2b3c4d5e6f'

function confirm(permissions: (typeof Permission)[keyof typeof Permission][], archive = ARCHIVE) {
  return respond(() =>
    action({
      request: formRequest('https://unitae.example.test/settings/data', { intent: 'confirm-import', archive }),
      params: {},
      context: routeContext(permissions),
    } as never),
  )
}

beforeEach(() => {
  queued.length = 0
})

describe('data action — confirming an import', () => {
  it('starts the import for an admin, of the congregation’s own archive', async () => {
    // An admin's resolved permission set holds every permission.
    const response = await confirm(Object.values(Permission))
    expect(queued).toEqual([`1/imports/${ARCHIVE}.unitae`])
    expect(response.headers.get('Location')).toBe('/settings/data?importJob=job-1')
  })

  it('refuses a caller who can import but is not an admin', async () => {
    await confirm([Permission.CanImportCongregationData, Permission.CanConfigureCongregation])
    expect(queued).toEqual([])
  })

  it('refuses an archive id it did not mint, a path in particular', async () => {
    await confirm(Object.values(Permission), '../2/imports/x')
    expect(queued).toEqual([])
  })
})
