import { beforeEach, describe, expect, it, vi } from 'vitest'

const { PART_PRESET_COUNT, seedDefaultPartPresets } = await import('./seed-part-presets.server')
const { findUnknownVariables, renderShareMessage } = await import('../model/share-message')
const { PartPresetKey } = await import('../model/part-preset.type')
const { partPresetName, partPresetReaderLabel, partPresetShareMessage } = await import('../model/part-preset-defaults')

function makeDb() {
  return {
    partPreset: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  }
}

// Pulls the `data` object of every create() call, which is the observable
// outcome of seeding — what actually lands in the row.
function createdRows(db: ReturnType<typeof makeDb>) {
  return db.partPreset.create.mock.calls.map(([arg]) => (arg as { data: Record<string, unknown> }).data)
}

function rowFor(db: ReturnType<typeof makeDb>, key: string) {
  return createdRows(db).find(row => row.key === key)
}

const DANGLING_LABEL = /[:–—-]\s*$/m

beforeEach(() => {
  vi.resetAllMocks()
})

describe('seedDefaultPartPresets', () => {
  it('seeds the whole catalogue when none exist', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 1, 'fr')

    expect(createdRows(db)).toHaveLength(PART_PRESET_COUNT)
  })

  it('skips presets that already exist, so re-running is safe', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue({ id: 7 } as never)

    await seedDefaultPartPresets(db, 1, 'fr')

    expect(createdRows(db)).toHaveLength(0)
  })

  it('scopes every row to the congregation it was asked to seed', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 42, 'fr')

    expect(createdRows(db).every(row => row.congregationId === 42)).toBe(true)
  })

  it('marks seeded presets as system rows', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 1, 'fr')

    expect(createdRows(db).every(row => row.isSystem === true)).toBe(true)
  })

  it('seeds only part-scoped presets — service kinds are out of scope for now', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 1, 'fr')

    expect(createdRows(db).every(row => row.scope === 'part')).toBe(true)
  })

  it('carries the reader slot only for the two-person kinds', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 1, 'fr')

    expect(rowFor(db, 'bible-reading')?.hasReaderSlot).toBe(false)
    expect(rowFor(db, 'school-demonstration')?.hasReaderSlot).toBe(true)
    expect(rowFor(db, 'watchtower-study')?.hasReaderSlot).toBe(true)
  })

  it('allows an external speaker on prayer but not on spiritual gems', async () => {
    // Both confirmed explicitly — spiritual gems is a local assignment, whereas
    // a visiting brother may offer prayer.
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 1, 'fr')

    expect(rowFor(db, 'prayer')?.allowExternalSpeaker).toBe(true)
    expect(rowFor(db, 'spiritual-gems')?.allowExternalSpeaker).toBe(false)
  })

  it.each(['fr', 'en'] as const)('uses only known variables in every %s message', async locale => {
    // Ties the catalogue to the renderer: a typo'd placeholder would otherwise
    // ship silently and render as a gap in a real SMS.
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 1, locale)

    const offenders = createdRows(db)
      .map(row => ({ key: row.key, unknown: findUnknownVariables(String(row.shareMessage)) }))
      .filter(entry => entry.unknown.length > 0)
    expect(offenders).toEqual([])
  })

  it('stores no wording of its own, so the catalogue stays in charge', async () => {
    // The convention Role uses for built-ins. Storing the text here would
    // freeze the language at seed time for every congregation.
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 1, 'fr')

    for (const row of createdRows(db)) {
      expect(row.name).toBeNull()
      expect(row.speakerLabel).toBeNull()
      expect(row.readerLabel).toBeNull()
      expect(row.shareMessage).toBeNull()
    }
  })

  it.each(['fr', 'en'] as const)('every seeded kind resolves to a %s message and name', locale => {
    for (const key of Object.values(PartPresetKey)) {
      expect(partPresetName({ key, name: null }, locale)).not.toBe(key)
      expect(partPresetShareMessage({ key, shareMessage: null }, locale).trim()).not.toBe('')
    }
  })

  it('names a second slot exactly for the kinds that have one', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 1, 'fr')

    for (const row of createdRows(db)) {
      const label = partPresetReaderLabel({ key: String(row.key), readerLabel: null })
      expect(label !== null).toBe(row.hasReaderSlot === true)
    }
  })
})
