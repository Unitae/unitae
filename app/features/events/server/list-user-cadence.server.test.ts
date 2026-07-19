import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findMany: vi.fn() },
    programmePartAssignment: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

const { listUserCadence } = await import('./list-user-cadence.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const NOW = new Date('2026-07-19T00:00:00.000Z')
const DEFAULT_ARGS = {
  userId: 5,
  event: { templateId: 42 as number | null, id: 100, startDate: NOW },
  congregationId: 1,
  partName: 'Bible Reading',
  partSection: 'Ministry',
  slot: 'assignee' as 'assignee' | 'assistant',
  pastCount: 6,
  futureCount: 6,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.event.findMany).mockResolvedValue([] as never)
  vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([] as never)
})

describe('listUserCadence', () => {
  it('short-circuits with empty arrays when templateId is null (freeform event)', async () => {
    const result = await listUserCadence(db, { ...DEFAULT_ARGS, event: { ...DEFAULT_ARGS.event, templateId: null } })

    expect(result).toEqual({ past: [], future: [], hasHistory: false })
    expect(db.event.findMany).not.toHaveBeenCalled()
  })

  it('queries past events by templateId + congregationId with startDate < currentEvent.startDate', async () => {
    await listUserCadence(db, DEFAULT_ARGS)

    const pastCall = vi.mocked(db.event.findMany).mock.calls[0][0]
    expect(pastCall?.where).toMatchObject({
      templateId: 42,
      congregationId: 1,
      startDate: { lt: NOW },
    })
  })

  it('orders past events by startDate desc and caps at pastCount', async () => {
    await listUserCadence(db, DEFAULT_ARGS)

    const pastCall = vi.mocked(db.event.findMany).mock.calls[0][0]
    expect(pastCall?.orderBy).toEqual({ startDate: 'desc' })
    expect(pastCall?.take).toBe(6)
  })

  it('queries future events by templateId + congregationId with startDate > currentEvent.startDate', async () => {
    await listUserCadence(db, DEFAULT_ARGS)

    const futureCall = vi.mocked(db.event.findMany).mock.calls[1][0]
    expect(futureCall?.where).toMatchObject({
      templateId: 42,
      congregationId: 1,
      startDate: { gt: NOW },
    })
  })

  it('orders future events by startDate asc and caps at futureCount', async () => {
    await listUserCadence(db, DEFAULT_ARGS)

    const futureCall = vi.mocked(db.event.findMany).mock.calls[1][0]
    expect(futureCall?.orderBy).toEqual({ startDate: 'asc' })
    expect(futureCall?.take).toBe(6)
  })

  it('reverses the past query result so entries flow oldest → newest', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        // Prisma returned newest-first (desc)
        { id: 3, startDate: new Date('2026-06-01'), partAssignments: [] },
        { id: 2, startDate: new Date('2026-05-01'), partAssignments: [] },
        { id: 1, startDate: new Date('2026-04-01'), partAssignments: [] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past.map(e => e.date)).toEqual([
      new Date('2026-04-01').toISOString(),
      new Date('2026-05-01').toISOString(),
      new Date('2026-06-01').toISOString(),
    ])
  })

  it("marks assigned=true when slot='assignee' and the user was the assignee", async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [{ name: 'Bible Reading', section: 'Ministry', assigneeId: 5, assistantId: null }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
  })

  it("marks assigned=true when slot='assistant' and the user was the assistant", async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [{ name: 'Bible Reading', section: 'Ministry', assigneeId: 99, assistantId: 5 }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, { ...DEFAULT_ARGS, slot: 'assistant' })

    expect(result.past[0].assigned).toBe(true)
  })

  // Regression pin: speaker one week ≠ reader another week for rotation purposes.
  // The two roles are distinct rotation buckets, so cross-role matches must NOT
  // light up cadence dots.
  it("marks assigned=false when slot='assignee' but the user was only the assistant", async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [{ name: 'Bible Reading', section: 'Ministry', assigneeId: 99, assistantId: 5 }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it("marks assigned=false when slot='assistant' but the user was only the assignee", async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [{ name: 'Bible Reading', section: 'Ministry', assigneeId: 5, assistantId: null }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, { ...DEFAULT_ARGS, slot: 'assistant' })

    expect(result.past[0].assigned).toBe(false)
  })

  it('marks assigned=false when neither slot is the user', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [{ name: 'Bible Reading', section: 'Ministry', assigneeId: 99, assistantId: 42 }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it('marks assigned=false when the event has no matching part assignment', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([{ id: 1, startDate: new Date('2026-04-01'), partAssignments: [] }] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it('ignores same-event parts whose name does not match, even if the user is assigned', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [
            { name: 'Song', section: 'Ministry', assigneeId: 5, assistantId: null },
            { name: 'Bible Reading', section: 'Ministry', assigneeId: 99, assistantId: null },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it('ignores parts whose section does not match, even if name matches and the user is assigned', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [
            // Same name, different section — must NOT feed the cadence.
            { name: 'Bible Reading', section: 'Weekend', assigneeId: 5, assistantId: null },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it('matches when both name and section line up exactly', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [{ name: 'Bible Reading', section: 'Ministry', assigneeId: 5, assistantId: null }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
  })

  it('matches when the historical row has surrounding whitespace in name or section', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [{ name: '  Bible Reading  ', section: ' Ministry ', assigneeId: 5, assistantId: null }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
  })

  it('matches when the case of the name or section differs', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [{ name: 'bible reading', section: 'MINISTRY', assigneeId: 5, assistantId: null }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
  })

  it('matches when diacritics differ (e.g. Ministère vs ministere)', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [{ name: 'Bible Reading', section: 'ministere', assigneeId: 5, assistantId: null }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, {
      ...DEFAULT_ARGS,
      partSection: 'Ministère',
    })

    expect(result.past[0].assigned).toBe(true)
  })

  it('returns both past and future entries in the expected shape', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [
            {
              name: 'Bible Reading',
              section: 'Ministry',
              assigneeId: 5,
              assistantId: null,
              assignee: { firstname: 'Jean', lastname: 'Dupont' },
              assistant: null,
            },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 2,
          startDate: new Date('2026-08-01'),
          partAssignments: [
            {
              name: 'Bible Reading',
              section: 'Ministry',
              assigneeId: 99,
              assistantId: null,
              assignee: { firstname: 'Marie', lastname: 'Curie' },
              assistant: null,
            },
          ],
        },
      ] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result).toEqual({
      past: [
        { date: new Date('2026-04-01').toISOString(), assigned: true, personName: 'Jean DUPONT', status: 'released' },
      ],
      future: [
        { date: new Date('2026-08-01').toISOString(), assigned: false, personName: 'Marie CURIE', status: 'released' },
      ],
      hasHistory: false,
    })
  })

  it("resolves personName from the assignee when slot='assignee'", async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [
            {
              name: 'Bible Reading',
              section: 'Ministry',
              assigneeId: 5,
              assistantId: 7,
              assignee: { firstname: 'Jean', lastname: 'Dupont' },
              assistant: { firstname: 'Marie', lastname: 'Curie' },
            },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].personName).toBe('Jean DUPONT')
  })

  it("resolves personName from the assistant when slot='assistant'", async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [
            {
              name: 'Bible Reading',
              section: 'Ministry',
              assigneeId: 5,
              assistantId: 7,
              assignee: { firstname: 'Jean', lastname: 'Dupont' },
              assistant: { firstname: 'Marie', lastname: 'Curie' },
            },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, { ...DEFAULT_ARGS, slot: 'assistant' })

    expect(result.past[0].personName).toBe('Marie CURIE')
  })

  it('returns personName=null when no matching part assignment exists on the historical event', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([{ id: 1, startDate: new Date('2026-04-01'), partAssignments: [] }] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].personName).toBeNull()
  })

  it('returns hasHistory=false when the person has never been on the slot at any past template instance', async () => {
    vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.hasHistory).toBe(false)
  })

  it('returns hasHistory=true when the person appears on the matching slot in a historical row (any age)', async () => {
    vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([
      { name: 'Bible Reading', section: 'Ministry' },
    ] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.hasHistory).toBe(true)
  })

  it('hasHistory ignores rows whose normalized name/section do not match the anchor', async () => {
    vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([
      { name: 'Song', section: 'Ministry' },
      { name: 'Bible Reading', section: 'Weekend' },
    ] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.hasHistory).toBe(false)
  })

  it('hasHistory query filters programmePartAssignment by the slot-matching FK', async () => {
    await listUserCadence(db, DEFAULT_ARGS)

    const call = vi.mocked(db.programmePartAssignment.findMany).mock.calls[0][0]
    expect(call?.where).toMatchObject({ assigneeId: 5 })
    expect(call?.where).not.toHaveProperty('assistantId')
  })

  it("propagates event.status as 'draft' when the future row is a draft", async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { id: 1, startDate: new Date('2026-08-01'), status: 'draft', partAssignments: [] },
      ] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.future[0].status).toBe('draft')
  })

  it("hasHistory query filters on assistantId when slot='assistant'", async () => {
    await listUserCadence(db, { ...DEFAULT_ARGS, slot: 'assistant' })

    const call = vi.mocked(db.programmePartAssignment.findMany).mock.calls[0][0]
    expect(call?.where).toMatchObject({ assistantId: 5 })
    expect(call?.where).not.toHaveProperty('assigneeId')
  })

  it('returns personName=null when the matching slot on the historical row is unassigned', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          partAssignments: [
            {
              name: 'Bible Reading',
              section: 'Ministry',
              assigneeId: null,
              assistantId: 7,
              assignee: null,
              assistant: { firstname: 'Marie', lastname: 'Curie' },
            },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserCadence(db, DEFAULT_ARGS)

    expect(result.past[0].personName).toBeNull()
  })
})
