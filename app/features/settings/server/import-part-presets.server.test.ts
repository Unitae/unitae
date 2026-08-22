import { beforeEach, describe, expect, it, vi } from 'vitest'

const readNdjsonFile = vi.fn()
vi.mock('./ndjson-archive', () => ({ readNdjsonFile: (...args: unknown[]) => readNdjsonFile(...args) }))

const { importPartPresetAllowedRoles, importPartPresets } = await import('./import-part-presets.server')
const { EntityIdMap } = await import('./data-transfer.type')

function preset(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    key: 'prayer',
    name: 'Prière',
    scope: 'part',
    hasReaderSlot: false,
    speakerLabel: 'Frère',
    readerLabel: null,
    allowExternalSpeaker: true,
    shareMessage: 'Bonjour {{assigneeFirstname}}',
    isSystem: true,
    ...overrides,
  }
}

function makeDb() {
  return {
    partPreset: { create: vi.fn().mockResolvedValue({ id: 700 } as never) },
    partPresetAllowedRole: { createMany: vi.fn().mockResolvedValue({} as never) },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('importPartPresets', () => {
  it('recreates presets under the target congregation and records the id remap', async () => {
    readNdjsonFile.mockResolvedValue([preset(12)])
    const db = makeDb()
    const idMap = new EntityIdMap()

    await importPartPresets({} as never, db as never, idMap, 42)

    expect(db.partPreset.create.mock.calls[0][0].data).toMatchObject({ key: 'prayer', congregationId: 42 })
    // The archive's ids mean nothing in the new congregation; later tables
    // resolve through the map.
    expect(idMap.get('part-presets', 12)).toBe(700)
  })

  it('preserves whether a preset was a system one', async () => {
    readNdjsonFile.mockResolvedValue([preset(1, { isSystem: false })])
    const db = makeDb()

    await importPartPresets({} as never, db as never, new EntityIdMap(), 1)

    expect(db.partPreset.create.mock.calls[0][0].data.isSystem).toBe(false)
  })

  it('carries the share message across, which is the whole point of the table', async () => {
    readNdjsonFile.mockResolvedValue([preset(1, { shareMessage: 'Texte personnalisé {{date}}' })])
    const db = makeDb()

    await importPartPresets({} as never, db as never, new EntityIdMap(), 1)

    expect(db.partPreset.create.mock.calls[0][0].data.shareMessage).toBe('Texte personnalisé {{date}}')
  })

  it('does nothing for a pre-2.5 archive with no preset file', async () => {
    readNdjsonFile.mockResolvedValue([])
    const db = makeDb()

    await importPartPresets({} as never, db as never, new EntityIdMap(), 1)

    expect(db.partPreset.create).not.toHaveBeenCalled()
  })
})

describe('importPartPresetAllowedRoles', () => {
  it('remaps both foreign keys', async () => {
    readNdjsonFile.mockResolvedValue([{ presetId: 12, roleId: 3, asKind: 'speaker' }])
    const db = makeDb()
    const idMap = new EntityIdMap()
    idMap.set('part-presets', 12, 700)
    idMap.set('roles', 3, 900)

    await importPartPresetAllowedRoles({} as never, db as never, idMap, 42)

    expect(db.partPresetAllowedRole.createMany.mock.calls[0][0].data).toEqual([
      { presetId: 700, roleId: 900, asKind: 'speaker', congregationId: 42 },
    ])
  })

  it('skips a row whose preset did not import rather than writing a dangling key', async () => {
    readNdjsonFile.mockResolvedValue([{ presetId: 999, roleId: 3, asKind: 'speaker' }])
    const db = makeDb()
    const idMap = new EntityIdMap()
    idMap.set('roles', 3, 900)

    await importPartPresetAllowedRoles({} as never, db as never, idMap, 1)

    expect(db.partPresetAllowedRole.createMany).not.toHaveBeenCalled()
  })

  it('skips a row whose role did not import', async () => {
    readNdjsonFile.mockResolvedValue([{ presetId: 12, roleId: 999, asKind: 'speaker' }])
    const db = makeDb()
    const idMap = new EntityIdMap()
    idMap.set('part-presets', 12, 700)

    await importPartPresetAllowedRoles({} as never, db as never, idMap, 1)

    expect(db.partPresetAllowedRole.createMany).not.toHaveBeenCalled()
  })
})
