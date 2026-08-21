import { beforeEach, describe, expect, it, vi } from 'vitest'

const { seedDefaultTemplates } = await import('./seed-templates.server')

// Sentinel ids, far from any array index, so a linked presetId cannot be
// mistaken for a coincidental match.
const SEEDED_PRESETS = [
  { id: 901, key: 'prayer' },
  { id: 902, key: 'spiritual-gems' },
  { id: 903, key: 'bible-reading' },
  { id: 904, key: 'christian-life-talk' },
]

function makeDb() {
  return {
    eventTemplate: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    // seedDefaultTemplates seeds the part presets first, then looks them up to
    // link each template part to its kind.
    partPreset: {
      findFirst: vi.fn().mockResolvedValue(null as never),
      create: vi.fn().mockResolvedValue({} as never),
      findMany: vi.fn().mockResolvedValue(SEEDED_PRESETS as never),
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('seedDefaultTemplates', () => {
  it('seeds all 5 templates when none exist', async () => {
    const db = makeDb()
    db.eventTemplate.findFirst.mockResolvedValue(null as never)
    db.eventTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    expect(db.eventTemplate.findFirst).toHaveBeenCalledTimes(5)
    expect(db.eventTemplate.create).toHaveBeenCalledTimes(5)
  })

  it('skips existing templates', async () => {
    const db = makeDb()
    db.eventTemplate.findFirst
      .mockResolvedValueOnce({ id: 1 } as never) // midweek exists
      .mockResolvedValueOnce(null as never) // weekend does not
      .mockResolvedValueOnce(null as never) // memorial does not
      .mockResolvedValueOnce(null as never) // day-off does not
      .mockResolvedValueOnce(null as never) // freeform does not
    db.eventTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    expect(db.eventTemplate.create).toHaveBeenCalledTimes(4)
  })

  it('skips all when all templates exist', async () => {
    const db = makeDb()
    db.eventTemplate.findFirst.mockResolvedValue({ id: 1 } as never)

    await seedDefaultTemplates(db, 1, 'fr')

    expect(db.eventTemplate.create).toHaveBeenCalledTimes(0)
  })

  it('creates templates with names from message functions', async () => {
    const db = makeDb()
    db.eventTemplate.findFirst.mockResolvedValue(null as never)
    db.eventTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    const createdNames = db.eventTemplate.create.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: { name: string } }).data.name,
    )
    expect(createdNames).toEqual([
      'Réunion de semaine',
      'Réunion du week-end',
      'Mémorial',
      'Absence',
      'Autre événement',
    ])
  })

  it('creates day-off and freeform templates with the right key, empty parts, and colour', async () => {
    const db = makeDb()
    db.eventTemplate.findFirst.mockResolvedValue(null as never)
    db.eventTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    const [, , , dayOffCall, freeformCall] = db.eventTemplate.create.mock.calls
    const dayOff = (dayOffCall[0] as { data: Record<string, unknown> }).data
    const freeform = (freeformCall[0] as { data: Record<string, unknown> }).data

    expect(dayOff.key).toBe('day-off')
    expect(dayOff.isRecurring).toBe(false)
    expect(dayOff.weekDay).toBeNull()
    expect(dayOff.color).toBe('#cfcfcf')
    expect((dayOff.parts as { create: unknown[] }).create).toEqual([])
    expect((dayOff.serviceParts as { create: unknown[] }).create).toEqual([])

    expect(freeform.key).toBe('freeform')
    expect(freeform.isRecurring).toBe(false)
    expect(freeform.weekDay).toBeNull()
    expect(freeform.color).toBe('#6366f1')
    expect((freeform.parts as { create: unknown[] }).create).toEqual([])
    expect((freeform.serviceParts as { create: unknown[] }).create).toEqual([])
  })

  it('creates parts with correct structure', async () => {
    const db = makeDb()
    db.eventTemplate.findFirst.mockResolvedValue(null as never)
    db.eventTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    // Check the midweek template (first create call)
    const midweekData = db.eventTemplate.create.mock.calls[0][0].data
    const midweekParts = midweekData.parts.create

    expect(midweekParts.length).toBe(12)

    // First part: song and prayer
    expect(midweekParts[0]).toEqual({
      name: 'Cantique et prière',
      section: '',
      order: 1,
      durationMin: 5,
      allowExternalSpeaker: false,
      presetId: 901,
      congregationId: 1,
    })

    // Every part has name, section, order, durationMin, allowExternalSpeaker, congregationId
    for (const part of midweekParts) {
      expect(part).toHaveProperty('name')
      expect(part).toHaveProperty('section')
      expect(part).toHaveProperty('order')
      expect(part).toHaveProperty('durationMin')
      expect(part).toHaveProperty('allowExternalSpeaker')
      expect(part).toHaveProperty('congregationId')
    }
  })

  it('links a seeded part to its preset', async () => {
    const db = makeDb()
    db.eventTemplate.findFirst.mockResolvedValue(null as never)
    db.eventTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    const midweekParts = db.eventTemplate.create.mock.calls[0][0].data.parts.create
    expect(midweekParts.find((p: { name: string }) => p.name === 'Lecture de la Bible').presetId).toBe(903)
  })

  it('leaves the ministry parts unlinked — their kind changes every week', async () => {
    // "1re partie" may be a demonstration one week and a talk the next, so the
    // seed must not guess: a wrong preset sends a confidently wrong message.
    const db = makeDb()
    db.eventTemplate.findFirst.mockResolvedValue(null as never)
    db.eventTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    const midweekParts = db.eventTemplate.create.mock.calls[0][0].data.parts.create
    const ministry = midweekParts.filter((p: { section: string }) => p.section === 'Appliquons-nous au ministère')
    expect(ministry).toHaveLength(3)
    expect(ministry.every((p: { presetId: number | null }) => p.presetId === null)).toBe(true)
  })

  it('leaves a part unlinked when its preset is missing rather than mislinking it', async () => {
    const db = makeDb()
    db.partPreset.findMany.mockResolvedValue([] as never)
    db.eventTemplate.findFirst.mockResolvedValue(null as never)
    db.eventTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    const midweekParts = db.eventTemplate.create.mock.calls[0][0].data.parts.create
    expect(midweekParts.every((p: { presetId: number | null }) => p.presetId === null)).toBe(true)
  })

  it('creates service roles for each meeting template', async () => {
    const db = makeDb()
    db.eventTemplate.findFirst.mockResolvedValue(null as never)
    db.eventTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    // Only the meeting-style templates (first 3) carry the shared service roles;
    // the day-off and freeform templates are structural placeholders with none.
    for (const call of db.eventTemplate.create.mock.calls.slice(0, 3)) {
      const roles = call[0].data.serviceParts.create
      expect(roles.length).toBe(4)
      expect(roles.map((r: { key: string }) => r.key)).toEqual(['sono', 'stage', 'welcome', 'cleaning'])
    }
  })

  it('passes the congregationId to the template, parts, and service roles', async () => {
    const db = makeDb()
    db.eventTemplate.findFirst.mockResolvedValue(null as never)
    db.eventTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 7, 'fr')

    for (const call of db.eventTemplate.create.mock.calls) {
      const data = call[0].data
      expect(data.congregationId).toBe(7)

      for (const part of data.parts.create) {
        expect(part.congregationId).toBe(7)
      }

      for (const role of data.serviceParts.create) {
        expect(role.congregationId).toBe(7)
      }
    }
  })

  it('checks existence with the correct key and congregationId', async () => {
    const db = makeDb()
    db.eventTemplate.findFirst.mockResolvedValue(null as never)
    db.eventTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 3, 'fr')

    const findCalls = db.eventTemplate.findFirst.mock.calls
    expect(findCalls[0][0]).toEqual({ where: { key: 'midweek-meeting', congregationId: 3 } })
    expect(findCalls[1][0]).toEqual({ where: { key: 'weekend-meeting', congregationId: 3 } })
    expect(findCalls[2][0]).toEqual({ where: { key: 'memorial', congregationId: 3 } })
    expect(findCalls[3][0]).toEqual({ where: { key: 'day-off', congregationId: 3 } })
    expect(findCalls[4][0]).toEqual({ where: { key: 'freeform', congregationId: 3 } })
  })
})
