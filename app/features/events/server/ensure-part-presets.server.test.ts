import { beforeEach, describe, expect, it, vi } from 'vitest'

const seedDefaultPartPresets = vi.fn()
vi.mock('./seed-part-presets.server', () => ({
  seedDefaultPartPresets: (...args: unknown[]) => seedDefaultPartPresets(...args),
}))

const { ensureDefaultPartPresets } = await import('./ensure-part-presets.server')

function makeDb(count: number) {
  return { partPreset: { count: vi.fn().mockResolvedValue(count as never) } }
}

beforeEach(() => {
  vi.resetAllMocks()
  seedDefaultPartPresets.mockResolvedValue(undefined)
})

describe('ensureDefaultPartPresets', () => {
  it('does nothing when the congregation already has presets', async () => {
    // The common case by far — it runs on every programme load, so it has to
    // cost one count and stop.
    const db = makeDb(11)

    await ensureDefaultPartPresets(db as never, 1, 'fr')

    expect(seedDefaultPartPresets).not.toHaveBeenCalled()
  })

  it('seeds the defaults for a congregation that has none', async () => {
    const db = makeDb(0)

    await ensureDefaultPartPresets(db as never, 42, 'fr')

    expect(seedDefaultPartPresets).toHaveBeenCalledWith(db, 42, 'fr')
  })

  it('scopes the count to the congregation', async () => {
    const db = makeDb(0)

    await ensureDefaultPartPresets(db as never, 42, 'fr')

    expect(db.partPreset.count).toHaveBeenCalledWith({ where: { congregationId: 42 } })
  })

  it('treats a concurrent seed as success rather than failing the page', async () => {
    // Two loads can both see zero and both try. The loser hits the unique key
    // on (key, congregationId) — but the presets exist either way, which is all
    // the caller wanted.
    const db = makeDb(0)
    seedDefaultPartPresets.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))

    await expect(ensureDefaultPartPresets(db as never, 1, 'fr')).resolves.toBeUndefined()
  })

  it('does not swallow an unrelated failure', async () => {
    const db = makeDb(0)
    seedDefaultPartPresets.mockRejectedValue(new Error('connection lost'))

    await expect(ensureDefaultPartPresets(db as never, 1, 'fr')).rejects.toThrow('connection lost')
  })

  it('falls back to French for an unrecognised locale', async () => {
    const db = makeDb(0)

    await ensureDefaultPartPresets(db as never, 1, 'de')

    expect(seedDefaultPartPresets).toHaveBeenCalledWith(db, 1, 'fr')
  })
})
