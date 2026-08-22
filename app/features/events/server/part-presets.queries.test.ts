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

  it('returns the capability the part editor has to show', async () => {
    // Without these the picker could only show a name, which is what made
    // choosing a preset look like it did nothing.
    const db = makeDb()

    await listPartPresets(db as never, 1)

    // key travels too: the built-in wording is looked up by it when the row
    // stores none of its own.
    expect(Object.keys(argsOf(db).select).sort()).toEqual([
      'allowExternalSpeaker',
      'hasReaderSlot',
      'id',
      'key',
      'name',
      'readerLabel',
      'shareMessage',
      'speakerLabel',
    ])
  })

  it('reduces the share message to a flag rather than shipping every body', async () => {
    // A body runs to a thousand characters and the editor only needs to say
    // whether one exists.
    const db = makeDb()
    db.partPreset.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'A',
        speakerLabel: null,
        readerLabel: null,
        hasReaderSlot: false,
        allowExternalSpeaker: false,
        shareMessage: 'Bonjour',
      },
      {
        id: 2,
        name: 'B',
        speakerLabel: null,
        readerLabel: null,
        hasReaderSlot: false,
        allowExternalSpeaker: false,
        shareMessage: '   ',
      },
    ] as never)

    const presets = await listPartPresets(db as never, 1)

    expect(presets.map(p => p.hasShareMessage)).toEqual([true, false])
    expect(presets[0]).not.toHaveProperty('shareMessage')
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
