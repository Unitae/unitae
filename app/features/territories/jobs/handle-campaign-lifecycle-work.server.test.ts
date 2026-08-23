import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { congregation: { findMany: vi.fn() } },
  withScope: vi.fn(),
}))
vi.mock('~/features/territories/server/campaign-lifecycle.workflow', () => ({
  activateCampaign: vi.fn(),
  endCampaign: vi.fn(),
}))
vi.mock('~/features/territories/server/campaign.queries', () => ({
  getCampaignsDueToActivate: vi.fn(),
  getCampaignsDueToEnd: vi.fn(),
}))

const { unscopedDb, withScope } = await import('~/shared/infra/db.server')
const workflow = await import('~/features/territories/server/campaign-lifecycle.workflow')
const queries = await import('~/features/territories/server/campaign.queries')
const { handleCampaignLifecycleWork, runCampaignLifecycleSweep } = await import(
  './handle-campaign-lifecycle-work.server'
)

const job = { id: 'j1', data: { triggeredAt: '2026-01-15T02:00:00Z' } } as Job<{ triggeredAt: string }>
const db = {} as never

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(queries.getCampaignsDueToActivate).mockResolvedValue([])
  vi.mocked(queries.getCampaignsDueToEnd).mockResolvedValue([])
  vi.mocked(workflow.activateCampaign).mockResolvedValue({ activated: true, paused: 0, closed: 0, reassigned: 0 })
  vi.mocked(workflow.endCampaign).mockResolvedValue({ ended: true, closedCampaign: 0, resumed: 0, closedRegulars: 0 })
  vi.mocked(withScope).mockImplementation(((_id: number, fn: (tx: never) => unknown) =>
    Promise.resolve(fn(db))) as never)
})

describe('runCampaignLifecycleSweep', () => {
  it('activates due campaigns then ends due campaigns', async () => {
    vi.mocked(queries.getCampaignsDueToActivate).mockResolvedValue([{ id: 1 }] as never)
    vi.mocked(queries.getCampaignsDueToEnd).mockResolvedValue([{ id: 2 }] as never)
    const now = new Date(2026, 0, 15)

    const result = await runCampaignLifecycleSweep(db, 10, now)

    expect(workflow.activateCampaign).toHaveBeenCalledWith(db, { id: 1 }, 10, 0, now)
    expect(workflow.endCampaign).toHaveBeenCalledWith(db, { id: 2 }, 10, 0, now)
    expect(result).toEqual({ activated: 1, ended: 1 })
  })

  it('counts only transitions that actually ran (idempotent re-runs report zero)', async () => {
    vi.mocked(queries.getCampaignsDueToActivate).mockResolvedValue([{ id: 1 }] as never)
    vi.mocked(workflow.activateCampaign).mockResolvedValue({ activated: false, paused: 0, closed: 0, reassigned: 0 })

    const result = await runCampaignLifecycleSweep(db, 10, new Date())
    expect(result.activated).toBe(0)
  })
})

describe('handleCampaignLifecycleWork', () => {
  it('sweeps every active congregation', async () => {
    vi.mocked(unscopedDb.congregation.findMany).mockResolvedValue([
      { id: 1, slug: 'a' },
      { id: 2, slug: 'b' },
    ] as never)

    await handleCampaignLifecycleWork(job)

    expect(withScope).toHaveBeenCalledTimes(2)
    expect(vi.mocked(withScope).mock.calls.map(c => c[0])).toEqual([1, 2])
  })

  it("swallows one congregation's failure and continues the sweep", async () => {
    vi.mocked(unscopedDb.congregation.findMany).mockResolvedValue([
      { id: 1, slug: 'a' },
      { id: 2, slug: 'b' },
    ] as never)
    vi.mocked(withScope).mockImplementationOnce(() => Promise.reject(new Error('tenant down')))

    await expect(handleCampaignLifecycleWork(job)).resolves.toBeUndefined()
    expect(withScope).toHaveBeenCalledTimes(2)
  })
})
