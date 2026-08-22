import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listPartPresets } = await import('./part-presets.queries')

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
