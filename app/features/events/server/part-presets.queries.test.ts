import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPartPresetById, listPartPresets, listPartPresetsForSettings } = await import('./part-presets.queries')

function makeDb() {
  return { partPreset: { findMany: vi.fn().mockResolvedValue([] as never) } }
}

function argsOf(db: ReturnType<typeof makeDb>) {
  return db.partPreset.findMany.mock.calls[0][0] as {
    where: Record<string, unknown>
    orderBy: unknown
    select: Record<string, boolean>
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('listPartPresets', () => {
  it('scopes to the congregation', async () => {
    const db = makeDb()

    await listPartPresets(db as never, 42)

    expect(argsOf(db).where.congregationId).toBe(42)
  })

  it('returns only part-scoped presets, never service ones', async () => {
    // The picker sits on a programme part; offering "Sono" there would be wrong.
    const db = makeDb()

    await listPartPresets(db as never, 1)

    expect(argsOf(db).where.scope).toBe('part')
  })

  it('orders by name so the picker is predictable', async () => {
    const db = makeDb()

    await listPartPresets(db as never, 1)

    expect(argsOf(db).orderBy).toEqual({ name: 'asc' })
  })

  it('selects only what the picker needs', async () => {
    // The share message can be long; the picker never renders it, and shipping
    // every body to the client on each programme edit would be waste.
    const db = makeDb()

    await listPartPresets(db as never, 1)

    expect(Object.keys(argsOf(db).select).sort()).toEqual(['id', 'name'])
  })
})

describe('listPartPresetsForSettings', () => {
  it('lists system presets before custom ones, each alphabetically', async () => {
    // The seeded kinds are what a congregation recognises; their own additions
    // belong underneath rather than interleaved.
    const db = { partPreset: { findMany: vi.fn().mockResolvedValue([] as never) } }

    await listPartPresetsForSettings(db as never, 1)

    expect(db.partPreset.findMany.mock.calls[0][0].orderBy).toEqual([{ isSystem: 'desc' }, { name: 'asc' }])
  })

  it('counts the parts using each preset so the delete guard can explain itself', async () => {
    const db = { partPreset: { findMany: vi.fn().mockResolvedValue([] as never) } }

    await listPartPresetsForSettings(db as never, 1)

    expect(db.partPreset.findMany.mock.calls[0][0].include._count.select).toEqual({
      templateParts: true,
      eventParts: true,
    })
  })
})

describe('getPartPresetById', () => {
  it('scopes the lookup to the congregation, never a bare id', async () => {
    const db = { partPreset: { findFirst: vi.fn().mockResolvedValue(null as never) } }

    await getPartPresetById(db as never, 5, 42)

    expect(db.partPreset.findFirst.mock.calls[0][0].where).toEqual({ id: 5, congregationId: 42 })
  })
})
