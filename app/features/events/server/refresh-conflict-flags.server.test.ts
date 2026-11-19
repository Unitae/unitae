import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findMany: vi.fn() },
    absence: { findMany: vi.fn() },
    eventPart: { findMany: vi.fn(), updateMany: vi.fn() },
    eventServicePart: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}))

const { refreshConflictFlags } = await import('./refresh-conflict-flags.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('refreshConflictFlags', () => {
  // The overlapping events come from `db.event.findMany`, the absences from `db.absence.findMany` in one batched query.
  //
  // `absentMemberIds` are the members who HAVE an overlapping absence. Their stub absence
  // spans a deliberately wide range so it overlaps every event in the fixture.
  function stubEventsAndAbsences(events: unknown[], absentMemberIds: number[]) {
    const absent = new Set(absentMemberIds)
    vi.mocked(db.event.findMany).mockResolvedValue(events as never)
    // biome-ignore lint/suspicious/noExplicitAny: mock signature needs to match Prisma's generated overloads
    vi.mocked(db.absence.findMany).mockImplementation(((args: any) => {
      const requested = (args?.where?.memberId?.in ?? []) as number[]
      return Promise.resolve(
        requested
          .filter(id => absent.has(id))
          .map(id => ({ startDate: new Date(2000, 0, 1), endDate: new Date(2100, 0, 1), memberId: id })),
      )
    }) as never)
  }

  // The batched writes group rows by outcome, so a row's flag is read off whichever
  // updateMany carried it rather than off a per-row update call.
  function flagWrittenFor(
    calls: { where?: unknown; data?: unknown }[] | undefined,
    rowId: number,
  ): boolean | undefined {
    for (const call of calls ?? []) {
      const ids = (call?.where as { id?: { in?: number[] } })?.id?.in ?? []
      if (ids.includes(rowId)) return (call?.data as { hasConflict?: boolean })?.hasConflict
    }
    return undefined
  }

  it('writes hasConflict:true when the member has an overlapping day-off', async () => {
    stubEventsAndAbsences([{ id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) }], [5])
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      { id: 100, eventId: 1, assigneeId: 5, assistantId: null },
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([{ id: 200, eventId: 1, assigneeId: 5 }] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    expect(
      flagWrittenFor(
        vi.mocked(db.eventPart.updateMany).mock.calls.map(c => c[0]),
        100,
      ),
    ).toBe(true)
    expect(
      flagWrittenFor(
        vi.mocked(db.eventServicePart.updateMany).mock.calls.map(c => c[0]),
        200,
      ),
    ).toBe(true)
  })

  it('writes hasConflict:false when the member no longer has an overlapping day-off', async () => {
    stubEventsAndAbsences([{ id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) }], [])
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      { id: 100, eventId: 1, assigneeId: 5, assistantId: null },
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([{ id: 200, eventId: 1, assigneeId: 5 }] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    expect(
      flagWrittenFor(
        vi.mocked(db.eventPart.updateMany).mock.calls.map(c => c[0]),
        100,
      ),
    ).toBe(false)
    expect(
      flagWrittenFor(
        vi.mocked(db.eventServicePart.updateMany).mock.calls.map(c => c[0]),
        200,
      ),
    ).toBe(false)
  })

  // The absence lookup must be a single batched query, not one per (participant, event).
  // This is the N+1 the batched shape exists to prevent.
  it('resolves every participant absence in one query', async () => {
    stubEventsAndAbsences(
      [
        { id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
        { id: 2, startDate: new Date(2026, 3, 15), endDate: new Date(2026, 3, 15) },
      ],
      [6],
    )
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      { id: 100, eventId: 1, assigneeId: 5, assistantId: 6 },
      { id: 101, eventId: 2, assigneeId: 5, assistantId: 7 },
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 16), 1)

    // One events query, then all absences at once.
    expect(vi.mocked(db.event.findMany).mock.calls).toHaveLength(1)
    const calls = vi.mocked(db.absence.findMany).mock.calls
    expect(calls).toHaveLength(1)

    // …asking for every distinct participant in one `in` clause.
    const absenceWhere = calls[0][0]?.where as { memberId?: { in?: number[] } }
    expect([...(absenceWhere.memberId?.in ?? [])].sort()).toEqual([5, 6, 7])

    // The per-row outcome still respects each row's own participants.
    expect(
      flagWrittenFor(
        vi.mocked(db.eventPart.updateMany).mock.calls.map(c => c[0]),
        100,
      ),
    ).toBe(true)
    expect(
      flagWrittenFor(
        vi.mocked(db.eventPart.updateMany).mock.calls.map(c => c[0]),
        101,
      ),
    ).toBe(false)
  })

  // An absence must only flag events it actually overlaps. The batched query widens to the
  // span of all matched events, so the in-memory check is what enforces per-event precision —
  // a regression there would mark every event conflicted once any absence existed.
  it('only flags the events an absence actually overlaps', async () => {
    // Absence covers 14 Apr only; event 1 is on the 14th, event 2 on the 20th.
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
      { id: 2, startDate: new Date(2026, 3, 20), endDate: new Date(2026, 3, 20) },
    ] as never)
    vi.mocked(db.absence.findMany).mockResolvedValue([
      { startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14), memberId: 5 },
    ] as never)
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      { id: 100, eventId: 1, assigneeId: 5, assistantId: null },
      { id: 101, eventId: 2, assigneeId: 5, assistantId: null },
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 21), 1)

    const calls = vi.mocked(db.eventPart.updateMany).mock.calls.map(c => c[0])
    expect(flagWrittenFor(calls, 100)).toBe(true) // same day as the absence
    expect(flagWrittenFor(calls, 101)).toBe(false) // six days later
  })

  // The clobber that #250's shape allowed: two members share a part
  // assignment (speaker + reader). When the refreshed member is fine but the
  // OTHER participant still has an overlapping absence, the row's
  // hasConflict must stay true — a bare `updateMany({ hasConflict: <this
  // member's result> })` would silently clear the flag and let release
  // proceed even though the co-participant is absent.
  it('preserves hasConflict when the co-participant still has an overlapping absence', async () => {
    // Alice(5) = speaker (assigneeId), Bob(6) = reader (assistantId).
    // Alice: no absence. Bob: absence present.
    stubEventsAndAbsences([{ id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) }], [6])
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      { id: 100, eventId: 1, assigneeId: 5, assistantId: 6 },
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)

    // Refresh for Alice (her absence just got cleared).
    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    expect(
      flagWrittenFor(
        vi.mocked(db.eventPart.updateMany).mock.calls.map(c => c[0]),
        100,
      ),
    ).toBe(true)
  })

  // Symmetric case: the refreshed member is fine as reader; speaker is fine
  // too. Both slots clear → flag must go false.
  it('writes hasConflict:false only when both participants are clear', async () => {
    stubEventsAndAbsences([{ id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) }], [])
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      { id: 100, eventId: 1, assigneeId: 5, assistantId: 6 },
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    expect(
      flagWrittenFor(
        vi.mocked(db.eventPart.updateMany).mock.calls.map(c => c[0]),
        100,
      ),
    ).toBe(false)
  })

  it('does nothing when no overlapping events', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    expect(db.eventPart.updateMany).not.toHaveBeenCalled()
    expect(db.eventServicePart.updateMany).not.toHaveBeenCalled()
    expect(db.eventPart.findMany).not.toHaveBeenCalled()
  })

  // Every overlapping event must be reconciled, not just the first. The old shape looped
  // per event; the batched shape asks for all of them in one query, so the guard is that
  // the query spans every event id and every matched row ends up written.
  it('reconciles rows from every overlapping event in one batched pass', async () => {
    stubEventsAndAbsences(
      [
        { id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
        { id: 2, startDate: new Date(2026, 3, 15), endDate: new Date(2026, 3, 15) },
        { id: 3, startDate: new Date(2026, 3, 16), endDate: new Date(2026, 3, 16) },
      ],
      [5],
    )
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      { id: 10, eventId: 1, assigneeId: 5, assistantId: null },
      { id: 20, eventId: 2, assigneeId: 5, assistantId: null },
      { id: 30, eventId: 3, assigneeId: 5, assistantId: null },
    ] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 17), 1)

    // One parts query, scoped to all three events rather than one per event.
    expect(vi.mocked(db.eventPart.findMany).mock.calls).toHaveLength(1)
    const partsWhere = vi.mocked(db.eventPart.findMany).mock.calls[0][0]?.where as {
      eventId?: { in?: number[] }
    }
    expect(partsWhere.eventId?.in).toEqual([1, 2, 3])

    // All three rows reconciled, in a single grouped write.
    const calls = vi.mocked(db.eventPart.updateMany).mock.calls.map(c => c[0])
    expect(calls).toHaveLength(1)
    expect((calls[0]?.where as { id?: { in?: number[] } } | undefined)?.id?.in).toEqual([10, 20, 30])
    expect(calls[0]?.data).toEqual({ hasConflict: true })
  })

  // Regression pin — participants are Members (`assigneeId`, `assistantId`
  // reference Member.id). Filtering with a UserAccount.id would silently miss
  // every assignment whose Member.id differs from the assignee's account.id.
  it('filters part and service assignments by memberId', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([
      { id: 1, startDate: new Date(2026, 3, 14), endDate: new Date(2026, 3, 14) },
    ] as never)
    vi.mocked(db.eventPart.findMany).mockResolvedValue([] as never)
    vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)

    const memberId = 5000
    await refreshConflictFlags(db, memberId, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    const partCall = vi.mocked(db.eventPart.findMany).mock.calls[0][0]
    const partWhere = partCall?.where as Record<string, unknown>
    expect(partWhere.OR).toEqual([{ assigneeId: memberId }, { assistantId: memberId }])

    const serviceCall = vi.mocked(db.eventServicePart.findMany).mock.calls[0][0]
    const serviceWhere = serviceCall?.where as Record<string, unknown>
    expect(serviceWhere.assigneeId).toBe(memberId)
  })

  // Regression pin — untemplated events also carry assignments (added
  // manually) and must participate in the hasConflict invariant. A prior
  // `templateId: { not: null }` filter excluded them.
  it('includes untemplated events (no templateId filter)', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    const call = vi.mocked(db.event.findMany).mock.calls[0][0]
    const where = call?.where as Record<string, unknown>
    expect(where).not.toHaveProperty('templateId')
  })

  // No template filter here: one through `template` would inner-join it and drop the events that have none.
  it('looks at every overlapping event, with or without a template', async () => {
    vi.mocked(db.event.findMany).mockResolvedValue([] as never)

    await refreshConflictFlags(db, 5, new Date(2026, 3, 13), new Date(2026, 3, 15), 1)

    const call = vi.mocked(db.event.findMany).mock.calls[0][0]
    const where = call?.where as Record<string, unknown>
    expect(where).not.toHaveProperty('NOT')
    expect(where).not.toHaveProperty('template')
  })
})
