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
  it('seeds all 3 templates when none exist', async () => {
    const db = makeDb()
    db.programmeTemplate.findFirst.mockResolvedValue(null as never)
    db.programmeTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    expect(db.programmeTemplate.findFirst).toHaveBeenCalledTimes(3)
    expect(db.programmeTemplate.create).toHaveBeenCalledTimes(3)
  })

  it('skips existing templates', async () => {
    const db = makeDb()
    db.programmeTemplate.findFirst
      .mockResolvedValueOnce({ id: 1 } as never) // midweek exists
      .mockResolvedValueOnce(null as never) // weekend does not
      .mockResolvedValueOnce(null as never) // memorial does not
    db.programmeTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    expect(db.programmeTemplate.create).toHaveBeenCalledTimes(2)
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
    expect(createdNames).toEqual(['Réunion de semaine', 'Réunion du week-end', 'Mémorial'])
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
      isVariable: false,
      congregationId: 1,
    })

    // Every part has name, section, order, durationMin, isVariable, congregationId
    for (const part of midweekParts) {
      expect(part).toHaveProperty('name')
      expect(part).toHaveProperty('section')
      expect(part).toHaveProperty('order')
      expect(part).toHaveProperty('durationMin')
      expect(part).toHaveProperty('isVariable')
      expect(part).toHaveProperty('congregationId')
    }
  })

  it('creates service roles for each template', async () => {
    const db = makeDb()
    db.programmeTemplate.findFirst.mockResolvedValue(null as never)
    db.programmeTemplate.create.mockResolvedValue({} as never)

    await seedDefaultTemplates(db, 1, 'fr')

    // Each template gets 4 shared service roles
    for (const call of db.programmeTemplate.create.mock.calls) {
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
  })
})
