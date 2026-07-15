import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { ConflictError, LimitReachedError } from '~/shared/errors/app-error.server'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {},
}))
vi.mock('~/features/territories/server/create-territory-from-split.server', () => ({
  createTerritoryFromSplit: vi.fn(),
}))
vi.mock('~/shared/utils/handle-app-error.server', () => ({
  appErrorToClientMessage: vi.fn(),
}))

const { splitToolCreateWorkflow } = await import('./split-tool-create.workflow')
const { createTerritoryFromSplit } = await import('./create-territory-from-split.server')
const { appErrorToClientMessage } = await import('~/shared/utils/handle-app-error.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

type LimitStub = { errorIfWouldGoOverLimit: (name: 'territories') => Promise<void> }

const okLimits: LimitStub = { errorIfWouldGoOverLimit: async () => {} }
const limitBreached: LimitStub = {
  errorIfWouldGoOverLimit: async () => {
    throw new LimitReachedError('territories')
  },
}

const validParams = {
  type: TerritoryKind.Classical,
  entranceIds: [1, 2, 3],
  congregationId: 42,
  actorId: 99,
}

beforeEach(() => {
  vi.resetAllMocks()
  // Default: pass through a plausible non-empty message. Individual tests can override.
  vi.mocked(appErrorToClientMessage).mockImplementation(error => `translated:${error.constructor.name}`)
})

describe('splitToolCreateWorkflow', () => {
  it('returns { ok: true, number, territoryId } on happy path', async () => {
    vi.mocked(createTerritoryFromSplit).mockResolvedValue({
      id: 7,
      number: 'D001',
      type: TerritoryKind.Classical,
    } as never)

    const result = await splitToolCreateWorkflow(db as never, validParams, okLimits)

    expect(result).toEqual({ ok: true, number: 'D001', territoryId: 7 })
  })

  it('short-circuits on LimitReachedError before calling createTerritoryFromSplit', async () => {
    const result = await splitToolCreateWorkflow(db as never, validParams, limitBreached)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(429)
      expect(result.error).not.toBe('')
    }
    expect(createTerritoryFromSplit).not.toHaveBeenCalled()
  })

  it('converts a ConflictError from the create step into { ok: false, error, status }', async () => {
    vi.mocked(createTerritoryFromSplit).mockRejectedValue(new ConflictError('territory number in use'))

    const result = await splitToolCreateWorkflow(db as never, validParams, okLimits)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(409)
      expect(result.error).not.toBe('')
    }
  })

  it('re-throws non-AppError so the framework surfaces the crash (does not swallow)', async () => {
    const bug = new Error('prisma exploded')
    vi.mocked(createTerritoryFromSplit).mockRejectedValue(bug)

    await expect(splitToolCreateWorkflow(db as never, validParams, okLimits)).rejects.toBe(bug)
  })

  it('every failure result has a non-empty error message (guards the empty-toast bug)', async () => {
    const limitResult = await splitToolCreateWorkflow(db as never, validParams, limitBreached)
    expect(limitResult.ok).toBe(false)
    if (!limitResult.ok) expect(limitResult.error.length).toBeGreaterThan(0)
  })

  it('falls back to a non-empty message when the translator returns an empty string', async () => {
    // Simulates a missing/broken Paraglide key at deploy time — the original bug is that
    // toast.error('') is a silent no-op.
    vi.mocked(appErrorToClientMessage).mockReturnValue('')
    vi.mocked(createTerritoryFromSplit).mockRejectedValue(new ConflictError('territory number in use'))

    const result = await splitToolCreateWorkflow(db as never, validParams, okLimits)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })
})
