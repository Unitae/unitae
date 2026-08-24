import { beforeEach, describe, expect, it, vi } from 'vitest'

const readNdjsonFile = vi.fn()
vi.mock('./ndjson-archive', () => ({ readNdjsonFile: (...args: unknown[]) => readNdjsonFile(...args) }))

const warn = vi.fn()
vi.mock('~/shared/infra/logger.server', () => ({ createLogger: () => ({ warn, info: vi.fn(), error: vi.fn() }) }))

const { importPartPresets } = await import('./import-part-presets.server')
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
  let nextId = 700
  return {
    partPreset: { create: vi.fn().mockImplementation(() => Promise.resolve({ id: nextId++ })) },
  }
}

function archive(presets: unknown[], legacyEligibility: unknown[] = []) {
  readNdjsonFile.mockImplementation((_zip: unknown, name: unknown) => {
    if (name === 'part-presets') return Promise.resolve(presets)
    if (name === 'part-preset-allowed-roles') return Promise.resolve(legacyEligibility)
    return Promise.resolve([])
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('importPartPresets', () => {
  it('recreates presets under the target congregation and records the id remap', async () => {
    archive([preset(12)])
    const db = makeDb()
    const idMap = new EntityIdMap()

    await importPartPresets({} as never, db as never, idMap, 42)

    expect(db.partPreset.create.mock.calls[0][0].data).toMatchObject({ key: 'prayer', congregationId: 42 })
    // The archive's ids mean nothing in the new congregation; later tables
    // resolve through the map.
    expect(idMap.get('part-presets', 12)).toBe(700)
  })

  it('preserves whether a preset was a system one', async () => {
    archive([preset(1, { isSystem: false })])
    const db = makeDb()

    await importPartPresets({} as never, db as never, new EntityIdMap(), 1)

    expect(db.partPreset.create.mock.calls[0][0].data.isSystem).toBe(false)
  })

  it('carries the share message across, which is the whole point of the table', async () => {
    archive([preset(1, { shareMessage: 'Texte personnalisé {{date}}' })])
    const db = makeDb()

    await importPartPresets({} as never, db as never, new EntityIdMap(), 1)

    expect(db.partPreset.create.mock.calls[0][0].data.shareMessage).toBe('Texte personnalisé {{date}}')
  })

  it('does nothing for a pre-2.5 archive with no preset file', async () => {
    archive([])
    const db = makeDb()

    await importPartPresets({} as never, db as never, new EntityIdMap(), 1)

    expect(db.partPreset.create).not.toHaveBeenCalled()
  })

  it('folds the three legacy midweek talk kinds into one midweek-talk row', async () => {
    archive([
      preset(10, { key: 'spiritual-gems' }),
      preset(11, { key: 'spiritual-pearls' }),
      preset(12, { key: 'christian-life-talk' }),
    ])
    const db = makeDb()
    const idMap = new EntityIdMap()

    await importPartPresets({} as never, db as never, idMap, 42)

    // One row, on catalogue defaults, and every legacy id resolves to it so
    // parts pointing at any of the three stay linked.
    expect(db.partPreset.create).toHaveBeenCalledTimes(1)
    expect(db.partPreset.create.mock.calls[0][0].data).toMatchObject({
      key: 'midweek-talk',
      name: null,
      shareMessage: null,
      isSystem: true,
      congregationId: 42,
    })
    expect(idMap.get('part-presets', 10)).toBe(700)
    expect(idMap.get('part-presets', 11)).toBe(700)
    expect(idMap.get('part-presets', 12)).toBe(700)
  })

  it('leaves a custom preset alone even if it shares a legacy key', async () => {
    // Only system rows fold: a congregation-created preset is its own kind,
    // whatever it happens to be called.
    archive([preset(10, { key: 'spiritual-gems', isSystem: false })])
    const db = makeDb()

    await importPartPresets({} as never, db as never, new EntityIdMap(), 1)

    expect(db.partPreset.create.mock.calls[0][0].data).toMatchObject({ key: 'spiritual-gems', isSystem: false })
  })
})

describe('discarded preset-level eligibility', () => {
  it('logs how many rows a v2.5 archive lost, so a support case can be reconstructed', () => {
    // The user is warned before confirming (see legacyPresetWarnings); this is
    // the operator-side record of what actually went missing.
    archive([preset(1)], [{ presetId: 10 }, { presetId: 11 }])
    const db = makeDb()

    return importPartPresets({} as never, db as never, new EntityIdMap(), 42).then(() => {
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('2'), expect.objectContaining({ congregationId: 42 }))
    })
  })

  it('stays quiet when the archive carries no preset-level eligibility', async () => {
    archive([preset(1)], [])
    const db = makeDb()

    await importPartPresets({} as never, db as never, new EntityIdMap(), 42)

    expect(warn).not.toHaveBeenCalled()
  })
})
