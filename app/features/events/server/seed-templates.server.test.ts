import { beforeEach, describe, expect, it, vi } from 'vitest'

const { seedDefaultTemplates } = await import('./seed-templates.server')

function makeDb() {
  return {
    programmeTemplate: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('seedDefaultTemplates', () => {
  it('seeds all 5 templates when none exist', async () => {
    const db = makeDb()
    db.programmeTemplate.findFirst.mockResolvedValue(null as never)
    db.programmeTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    expect(db.programmeTemplate.findFirst).toHaveBeenCalledTimes(5)
    expect(db.programmeTemplate.create).toHaveBeenCalledTimes(5)
  })

  it('skips existing templates', async () => {
    const db = makeDb()
    db.programmeTemplate.findFirst
      .mockResolvedValueOnce({ id: 1 } as never) // midweek exists
      .mockResolvedValueOnce(null as never) // weekend does not
      .mockResolvedValueOnce(null as never) // memorial does not
      .mockResolvedValueOnce(null as never) // day-off does not
      .mockResolvedValueOnce(null as never) // freeform does not
    db.programmeTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    expect(db.programmeTemplate.create).toHaveBeenCalledTimes(4)
  })

  it('skips all when all templates exist', async () => {
    const db = makeDb()
    db.programmeTemplate.findFirst.mockResolvedValue({ id: 1 } as never)

    await seedDefaultTemplates(db, 1, 'fr')

    expect(db.programmeTemplate.create).toHaveBeenCalledTimes(0)
  })

  it('creates templates with names from message functions', async () => {
    const db = makeDb()
    db.programmeTemplate.findFirst.mockResolvedValue(null as never)
    db.programmeTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    const createdNames = db.programmeTemplate.create.mock.calls.map(
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
    db.programmeTemplate.findFirst.mockResolvedValue(null as never)
    db.programmeTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    const [, , , dayOffCall, freeformCall] = db.programmeTemplate.create.mock.calls
    const dayOff = (dayOffCall[0] as { data: Record<string, unknown> }).data
    const freeform = (freeformCall[0] as { data: Record<string, unknown> }).data

    expect(dayOff.key).toBe('day-off')
    expect(dayOff.isRecurring).toBe(false)
    expect(dayOff.weekDay).toBeNull()
    expect(dayOff.color).toBe('#cfcfcf')
    expect((dayOff.parts as { create: unknown[] }).create).toEqual([])
    expect((dayOff.serviceRoles as { create: unknown[] }).create).toEqual([])

    expect(freeform.key).toBe('freeform')
    expect(freeform.isRecurring).toBe(false)
    expect(freeform.weekDay).toBeNull()
    expect(freeform.color).toBe('#6366f1')
    expect((freeform.parts as { create: unknown[] }).create).toEqual([])
    expect((freeform.serviceRoles as { create: unknown[] }).create).toEqual([])
  })

  it('creates parts with correct structure', async () => {
    const db = makeDb()
    db.programmeTemplate.findFirst.mockResolvedValue(null as never)
    db.programmeTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    // Check the midweek template (first create call)
    const midweekData = db.programmeTemplate.create.mock.calls[0][0].data
    const midweekParts = midweekData.parts.create

    expect(midweekParts.length).toBe(12)

    // First part: song and prayer
    expect(midweekParts[0]).toEqual({
      name: 'Cantique et prière',
      section: '',
      order: 1,
      durationMin: 5,
      allowExternalSpeaker: false,
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

  it('creates service roles for each meeting template', async () => {
    const db = makeDb()
    db.programmeTemplate.findFirst.mockResolvedValue(null as never)
    db.programmeTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    // Only the meeting-style templates (first 3) carry the shared service roles;
    // the day-off and freeform templates are structural placeholders with none.
    for (const call of db.programmeTemplate.create.mock.calls.slice(0, 3)) {
      const roles = call[0].data.serviceRoles.create
      expect(roles.length).toBe(4)
      expect(roles.map((r: { key: string }) => r.key)).toEqual(['sono', 'stage', 'welcome', 'cleaning'])
    }
  })

  it('passes the congregationId to the template, parts, and service roles', async () => {
    const db = makeDb()
    db.programmeTemplate.findFirst.mockResolvedValue(null as never)
    db.programmeTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 7, 'fr')

    for (const call of db.programmeTemplate.create.mock.calls) {
      const data = call[0].data
      expect(data.congregationId).toBe(7)

      for (const part of data.parts.create) {
        expect(part.congregationId).toBe(7)
      }

      for (const role of data.serviceRoles.create) {
        expect(role.congregationId).toBe(7)
      }
    }
  })

  it('checks existence with the correct key and congregationId', async () => {
    const db = makeDb()
    db.programmeTemplate.findFirst.mockResolvedValue(null as never)
    db.programmeTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 3, 'fr')

    const findCalls = db.programmeTemplate.findFirst.mock.calls
    expect(findCalls[0][0]).toEqual({ where: { key: 'midweek-meeting', congregationId: 3 } })
    expect(findCalls[1][0]).toEqual({ where: { key: 'weekend-meeting', congregationId: 3 } })
    expect(findCalls[2][0]).toEqual({ where: { key: 'memorial', congregationId: 3 } })
    expect(findCalls[3][0]).toEqual({ where: { key: 'day-off', congregationId: 3 } })
    expect(findCalls[4][0]).toEqual({ where: { key: 'freeform', congregationId: 3 } })
  })
})
