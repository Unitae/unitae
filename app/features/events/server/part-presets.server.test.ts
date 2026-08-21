import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  AuditAction: {
    PartPresetCreated: 'part_preset.created',
    PartPresetUpdated: 'part_preset.updated',
    PartPresetDeleted: 'part_preset.deleted',
  },
}))

const { createPartPreset, deletePartPreset, updatePartPreset } = await import('./part-presets.server')

function makeDb() {
  return {
    partPreset: {
      findFirst: vi.fn().mockResolvedValue(null as never),
      findMany: vi.fn().mockResolvedValue([] as never),
      create: vi.fn().mockResolvedValue({ id: 1 } as never),
      update: vi.fn().mockResolvedValue({ id: 1 } as never),
      delete: vi.fn().mockResolvedValue({ id: 1 } as never),
    },
  }
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Discours de circonscription',
    hasReaderSlot: false,
    speakerLabel: 'Orateur',
    readerLabel: null,
    allowExternalSpeaker: true,
    shareMessage: 'Bonjour {{assigneeFirstname}}, tu as {{partName}} le {{date}}.',
    ...overrides,
  }
}

function createdData(db: ReturnType<typeof makeDb>) {
  return db.partPreset.create.mock.calls[0][0].data as Record<string, unknown>
}

function updatedData(db: ReturnType<typeof makeDb>) {
  return db.partPreset.update.mock.calls[0][0].data as Record<string, unknown>
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createPartPreset', () => {
  it('scopes the new preset to the congregation and marks it non-system', async () => {
    const db = makeDb()
    db.partPreset.findMany.mockResolvedValue([] as never)

    await createPartPreset(db as never, input(), 42, 7)

    expect(createdData(db)).toMatchObject({ congregationId: 42, isSystem: false, scope: 'part' })
  })

  it('derives a readable key from the name', async () => {
    const db = makeDb()

    await createPartPreset(db as never, input({ name: 'Discours de circonscription' }), 1, 7)

    expect(createdData(db).key).toBe('discours-de-circonscription')
  })

  it('suffixes the key when one already exists rather than colliding', async () => {
    // key is unique per congregation; two presets named alike must both save.
    const db = makeDb()
    db.partPreset.findMany.mockResolvedValue([{ key: 'discours' }] as never)

    await createPartPreset(db as never, input({ name: 'Discours' }), 1, 7)

    expect(createdData(db).key).toBe('discours-2')
  })

  it('keeps suffixing past an existing suffix', async () => {
    const db = makeDb()
    db.partPreset.findMany.mockResolvedValue([{ key: 'discours' }, { key: 'discours-2' }] as never)

    await createPartPreset(db as never, input({ name: 'Discours' }), 1, 7)

    expect(createdData(db).key).toBe('discours-3')
  })

  it('falls back to a usable key when the name has no slug characters', async () => {
    const db = makeDb()

    await createPartPreset(db as never, input({ name: '???' }), 1, 7)

    expect(String(createdData(db).key).length).toBeGreaterThan(0)
  })

  it('clears the reader label when the kind has no reader slot', async () => {
    // Illegal state: a label for a slot that does not exist. The picker would
    // show a reader field that can never be filled.
    const db = makeDb()

    await createPartPreset(db as never, input({ hasReaderSlot: false, readerLabel: 'Lecteur' }), 1, 7)

    expect(createdData(db).readerLabel).toBeNull()
  })

  it('keeps the reader label when the kind has a reader slot', async () => {
    const db = makeDb()

    await createPartPreset(db as never, input({ hasReaderSlot: true, readerLabel: 'Interlocuteur' }), 1, 7)

    expect(createdData(db).readerLabel).toBe('Interlocuteur')
  })
})

describe('updatePartPreset', () => {
  it('returns null when the preset does not exist', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)

    expect(await updatePartPreset(db as never, 5, input(), 1, 7)).toBeNull()
  })

  it('never rewrites the key, even when the name changes', async () => {
    // The key is the preset's identity: seeding looks system rows up by it and
    // the backfill matches on it. Renaming must not break either.
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue({ id: 5, key: 'bible-reading', isSystem: true } as never)

    await updatePartPreset(db as never, 5, input({ name: 'Autre nom' }), 1, 7)

    expect(updatedData(db)).not.toHaveProperty('key')
    expect(updatedData(db).name).toBe('Autre nom')
  })

  it('lets a system preset be edited — the congregation owns the wording', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue({ id: 5, key: 'prayer', isSystem: true } as never)

    const result = await updatePartPreset(db as never, 5, input({ shareMessage: 'Nouveau texte {{date}}' }), 1, 7)

    expect(result).not.toBeNull()
    expect(updatedData(db).shareMessage).toBe('Nouveau texte {{date}}')
  })

  it('clears the reader label when the reader slot is turned off', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue({ id: 5, key: 'x', isSystem: false } as never)

    await updatePartPreset(db as never, 5, input({ hasReaderSlot: false, readerLabel: 'Lecteur' }), 1, 7)

    expect(updatedData(db).readerLabel).toBeNull()
  })
})

describe('deletePartPreset', () => {
  it('reports not-found for an unknown preset', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue(null as never)

    expect(await deletePartPreset(db as never, 5, 1, 7)).toEqual({ ok: false, reason: 'not-found' })
  })

  it('refuses to delete a system preset', async () => {
    // Seeding would silently recreate it, and the backfill matches on its key.
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue({
      id: 5,
      name: 'Prière',
      isSystem: true,
      _count: { templateParts: 0, eventParts: 0 },
    } as never)

    expect(await deletePartPreset(db as never, 5, 1, 7)).toEqual({ ok: false, reason: 'system' })
    expect(db.partPreset.delete).not.toHaveBeenCalled()
  })

  it('refuses to delete a preset still in use, reporting how many parts', async () => {
    // The FK is SET NULL, so deleting would silently strip the kind from live
    // programme parts and their share messages with it.
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue({
      id: 5,
      name: 'Discours',
      isSystem: false,
      _count: { templateParts: 2, eventParts: 9 },
    } as never)

    expect(await deletePartPreset(db as never, 5, 1, 7)).toEqual({ ok: false, reason: 'in-use', partCount: 11 })
    expect(db.partPreset.delete).not.toHaveBeenCalled()
  })

  it('deletes an unused custom preset', async () => {
    const db = makeDb()
    db.partPreset.findFirst.mockResolvedValue({
      id: 5,
      name: 'Discours',
      isSystem: false,
      _count: { templateParts: 0, eventParts: 0 },
    } as never)

    expect(await deletePartPreset(db as never, 5, 1, 7)).toEqual({ ok: true, name: 'Discours' })
    expect(db.partPreset.delete).toHaveBeenCalled()
  })
})
