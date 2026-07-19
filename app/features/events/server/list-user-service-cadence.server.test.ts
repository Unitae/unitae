import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findMany: vi.fn() },
  },
}))

const { listUserServiceCadence } = await import('./list-user-service-cadence.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const NOW = new Date('2026-07-19T00:00:00.000Z')
const DEFAULT_ARGS = {
  userId: 5,
  event: { templateId: 42 as number | null, id: 100, startDate: NOW },
  congregationId: 1,
  serviceRoleName: 'Sono',
  pastCount: 6,
  futureCount: 6,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.event.findMany).mockResolvedValue([] as never)
})

describe('listUserServiceCadence', () => {
  it('short-circuits with empty arrays when templateId is null (freeform event)', async () => {
    const result = await listUserServiceCadence(db, {
      ...DEFAULT_ARGS,
      event: { ...DEFAULT_ARGS.event, templateId: null },
    })

    expect(result).toEqual({ past: [], future: [] })
    expect(db.event.findMany).not.toHaveBeenCalled()
  })

  it('queries past events by templateId + congregationId with startDate < currentEvent.startDate', async () => {
    await listUserServiceCadence(db, DEFAULT_ARGS)

    const pastCall = vi.mocked(db.event.findMany).mock.calls[0][0]
    expect(pastCall?.where).toMatchObject({
      templateId: 42,
      congregationId: 1,
      startDate: { lt: NOW },
    })
  })

  it('orders past events by startDate desc and caps at pastCount', async () => {
    await listUserServiceCadence(db, DEFAULT_ARGS)

    const pastCall = vi.mocked(db.event.findMany).mock.calls[0][0]
    expect(pastCall?.orderBy).toEqual({ startDate: 'desc' })
    expect(pastCall?.take).toBe(6)
  })

  it('queries future events by templateId + congregationId with startDate > currentEvent.startDate', async () => {
    await listUserServiceCadence(db, DEFAULT_ARGS)

    const futureCall = vi.mocked(db.event.findMany).mock.calls[1][0]
    expect(futureCall?.where).toMatchObject({
      templateId: 42,
      congregationId: 1,
      startDate: { gt: NOW },
    })
  })

  it('orders future events by startDate asc and caps at futureCount', async () => {
    await listUserServiceCadence(db, DEFAULT_ARGS)

    const futureCall = vi.mocked(db.event.findMany).mock.calls[1][0]
    expect(futureCall?.orderBy).toEqual({ startDate: 'asc' })
    expect(futureCall?.take).toBe(6)
  })

  it('reverses the past query result so entries flow oldest → newest', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        { id: 3, startDate: new Date('2026-06-01'), serviceRoleAssignments: [] },
        { id: 2, startDate: new Date('2026-05-01'), serviceRoleAssignments: [] },
        { id: 1, startDate: new Date('2026-04-01'), serviceRoleAssignments: [] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past.map(e => e.date)).toEqual([
      new Date('2026-04-01').toISOString(),
      new Date('2026-05-01').toISOString(),
      new Date('2026-06-01').toISOString(),
    ])
  })

  it('marks assigned=true when the user is the service assignee', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          serviceRoleAssignments: [{ name: 'Sono', assigneeId: 5 }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
  })

  it('marks assigned=false when a different person holds the same service role', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          serviceRoleAssignments: [{ name: 'Sono', assigneeId: 99 }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it('marks assigned=false when the event has no matching service role assignment', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([{ id: 1, startDate: new Date('2026-04-01'), serviceRoleAssignments: [] }] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it('ignores other service roles on the same event even when the user is assigned to them', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          serviceRoleAssignments: [
            { name: 'Sono', assigneeId: 99 },
            { name: 'Accueil', assigneeId: 5 },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it('matches when name lines up exactly', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        { id: 1, startDate: new Date('2026-04-01'), serviceRoleAssignments: [{ name: 'Sono', assigneeId: 5 }] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
  })

  it('matches when the historical row has surrounding whitespace on the name', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        { id: 1, startDate: new Date('2026-04-01'), serviceRoleAssignments: [{ name: '  Sono  ', assigneeId: 5 }] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
  })

  it('matches when the case of the name differs', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        { id: 1, startDate: new Date('2026-04-01'), serviceRoleAssignments: [{ name: 'SONO', assigneeId: 5 }] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
  })

  it('matches when diacritics differ (Accueil ↔ accueil)', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        { id: 1, startDate: new Date('2026-04-01'), serviceRoleAssignments: [{ name: 'accueil', assigneeId: 5 }] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, { ...DEFAULT_ARGS, serviceRoleName: 'Accueil' })

    expect(result.past[0].assigned).toBe(true)
  })

  it('does not match on a genuinely different name', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          serviceRoleAssignments: [{ name: 'Chairman', assigneeId: 5 }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it('returns both past and future entries in the expected shape', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          serviceRoleAssignments: [
            { name: 'Sono', assigneeId: 5, assignee: { firstname: 'Jean', lastname: 'Dupont' } },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 2,
          startDate: new Date('2026-08-01'),
          serviceRoleAssignments: [
            { name: 'Sono', assigneeId: 99, assignee: { firstname: 'Marie', lastname: 'Curie' } },
          ],
        },
      ] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result).toEqual({
      past: [{ date: new Date('2026-04-01').toISOString(), assigned: true, personName: 'Jean DUPONT' }],
      future: [{ date: new Date('2026-08-01').toISOString(), assigned: false, personName: 'Marie CURIE' }],
    })
  })

  it('resolves personName from the historical assignee', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          serviceRoleAssignments: [
            { name: 'Sono', assigneeId: 5, assignee: { firstname: 'Jean', lastname: 'Dupont' } },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past[0].personName).toBe('Jean DUPONT')
  })

  it('returns personName=null when the historical row has no assignee', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          serviceRoleAssignments: [{ name: 'Sono', assigneeId: null, assignee: null }],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past[0].personName).toBeNull()
  })

  it('returns personName=null when the event has no matching service assignment', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([{ id: 1, startDate: new Date('2026-04-01'), serviceRoleAssignments: [] }] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listUserServiceCadence(db, DEFAULT_ARGS)

    expect(result.past[0].personName).toBeNull()
  })
})
