import { beforeEach, describe, expect, it, vi } from 'vitest'

const { backfillCongregationPartPresets } = await import('./backfill-part-presets.server')

const PRESETS = [
  { id: 901, key: 'prayer' },
  { id: 902, key: 'spiritual-gems' },
  { id: 903, key: 'spiritual-pearls' },
  { id: 904, key: 'bible-reading' },
  { id: 905, key: 'christian-life-talk' },
  { id: 906, key: 'public-talk' },
  { id: 907, key: 'watchtower-study' },
  { id: 908, key: 'congregation-bible-study' },
]

function makeDb(templateParts: unknown[] = [], eventParts: unknown[] = []) {
  return {
    partPreset: { findMany: vi.fn().mockResolvedValue(PRESETS as never) },
    templatePart: { findMany: vi.fn().mockResolvedValue(templateParts as never), update: vi.fn() },
    eventPart: { findMany: vi.fn().mockResolvedValue(eventParts as never), update: vi.fn() },
  }
}

function part(id: number, name: string, section = '') {
  return { id, name, section }
}

function updatedPresetIds(fn: { mock: { calls: unknown[][] } }) {
  return fn.mock.calls.map(([arg]) => (arg as { data: { presetId: number } }).data.presetId)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('backfillCongregationPartPresets', () => {
  it('links parts whose seeded name identifies the kind unambiguously', async () => {
    const db = makeDb([part(1, 'Lecture de la Bible', 'Joyaux spirituels')])

    const result = await backfillCongregationPartPresets(db as never, 1, 'fr')

    expect(updatedPresetIds(db.templatePart.update)).toEqual([904])
    expect(result.templateParts).toBe(1)
    expect(result.unmatched).toBe(0)
  })

  it('leaves the ministry parts unmatched instead of guessing', async () => {
    // "1re partie" under the ministry section could be a demonstration, a talk
    // or a reading. Guessing sends a confidently wrong message.
    const db = makeDb([
      part(1, '1re partie', 'Appliquons-nous au ministère'),
      part(2, '2e partie', 'Appliquons-nous au ministère'),
      part(3, '3e partie', 'Appliquons-nous au ministère'),
    ])

    const result = await backfillCongregationPartPresets(db as never, 1, 'fr')

    expect(db.templatePart.update).not.toHaveBeenCalled()
    expect(result.unmatched).toBe(3)
  })

  it('distinguishes the same part name by its section', async () => {
    const db = makeDb([part(1, '1re partie', 'Vie chrétienne'), part(2, '1re partie', 'Appliquons-nous au ministère')])

    await backfillCongregationPartPresets(db as never, 1, 'fr')

    expect(updatedPresetIds(db.templatePart.update)).toEqual([905])
  })

  it('only matches a bare "Discours" inside the spiritual gems section', async () => {
    const db = makeDb([part(1, 'Discours', 'Joyaux spirituels'), part(2, 'Discours', '')])

    await backfillCongregationPartPresets(db as never, 1, 'fr')

    expect(updatedPresetIds(db.templatePart.update)).toEqual([902])
  })

  it('backfills event parts too, so existing programmes can be shared', async () => {
    const db = makeDb([], [part(50, 'Discours public')])

    const result = await backfillCongregationPartPresets(db as never, 1, 'fr')

    expect(updatedPresetIds(db.eventPart.update)).toEqual([906])
    expect(result.eventParts).toBe(1)
  })

  it('matches English seeded names as well as French', async () => {
    const db = makeDb([part(1, 'Bible Reading')])

    await backfillCongregationPartPresets(db as never, 1, 'en')

    expect(updatedPresetIds(db.templatePart.update)).toEqual([904])
  })

  it('leaves songs unmatched — they are not assignments', async () => {
    const db = makeDb([part(1, 'Cantique')])

    const result = await backfillCongregationPartPresets(db as never, 1, 'fr')

    expect(db.templatePart.update).not.toHaveBeenCalled()
    expect(result.unmatched).toBe(1)
  })

  it('reports a missing preset row separately from an unrecognised part', async () => {
    // Both leave the part unlinked, but they mean different things: an
    // unrecognised part is expected, whereas a rule matching with no preset row
    // means seeding never ran. Lumping them together would hide the fault.
    const db = makeDb([part(1, 'Lecture de la Bible')])
    db.partPreset.findMany.mockResolvedValue([] as never)

    const result = await backfillCongregationPartPresets(db as never, 1, 'fr')

    expect(db.templatePart.update).not.toHaveBeenCalled()
    expect(result.missingPresets).toBe(1)
    expect(result.unmatched).toBe(0)
  })

  it('reports nothing to do when every part is already linked', async () => {
    const db = makeDb()

    const result = await backfillCongregationPartPresets(db as never, 1, 'fr')

    expect(result).toEqual({ templateParts: 0, eventParts: 0, unmatched: 0, missingPresets: 0 })
  })
})
