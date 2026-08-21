import { beforeEach, describe, expect, it, vi } from 'vitest'

const { PART_PRESET_COUNT, seedDefaultPartPresets } = await import('./seed-part-presets.server')
const { findUnknownVariables, renderShareMessage } = await import('../model/share-message')

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

  it('gives every preset a non-empty share message', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 1, 'fr')

    const empty = createdRows(db).filter(row => String(row.shareMessage ?? '').trim() === '')
    expect(empty).toEqual([])
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

  it('names a reader slot only where one exists', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 1, 'fr')

    const mismatched = createdRows(db).filter(row => (row.readerLabel != null) !== (row.hasReaderSlot === true))
    expect(mismatched).toEqual([])
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

  it('still renders something useful when every optional detail is empty', async () => {
    // The worst realistic case: no topic, no assistant, no note, no link. The
    // greeting and the core sentence must survive, with no dangling labels.
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)
    db.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(db, 1, 'fr')

    const bare = {
      assignee: 'Jean Dupont',
      assigneeFirstname: 'Jean',
      assistant: null,
      partName: 'Lecture de la Bible',
      section: null,
      topic: null,
      duration: null,
      date: 'mardi 3 septembre',
      time: '19:00',
      eventName: 'Réunion de semaine',
      note: null,
      congregation: 'Assemblée de Lyon',
      link: null,
    }

    for (const row of createdRows(db)) {
      const text = renderShareMessage(String(row.shareMessage), bare)
      expect(text).toContain('Jean')
      expect(text).toContain('mardi 3 septembre')
      // A line left ending in a label separator means an empty variable was
      // not cleaned up. A trailing comma is fine — that is the greeting.
      expect(text).not.toMatch(DANGLING_LABEL)
    }
  })

  it('localises names', async () => {
    const fr = makeDb()
    fr.partPreset.findFirst.mockResolvedValue(null as never)
    fr.partPreset.create.mockResolvedValue({} as never)
    const en = makeDb()
    en.partPreset.findFirst.mockResolvedValue(null as never)
    en.partPreset.create.mockResolvedValue({} as never)

    await seedDefaultPartPresets(fr, 1, 'fr')
    await seedDefaultPartPresets(en, 1, 'en')

    expect(rowFor(fr, 'public-talk')?.name).not.toBe(rowFor(en, 'public-talk')?.name)
  })
})
