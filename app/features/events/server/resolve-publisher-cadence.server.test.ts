import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    eventPart: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    eventServicePart: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    event: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

const { resolvePublisherCadence } = await import('./resolve-publisher-cadence.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const NOW = new Date('2026-07-19T00:00:00.000Z')
const DEFAULT_ARGS = {
  userId: 5,
  event: { templateId: 42 as number | null, id: 100, startDate: NOW },
  congregationId: 1,
  excludePartAssignmentId: 77 as number | null,
  excludeServiceAssignmentId: null as number | null,
  partSlot: 'assignee' as 'assignee' | 'assistant',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.eventPart.findMany).mockResolvedValue([] as never)
  vi.mocked(db.eventServicePart.findMany).mockResolvedValue([] as never)
  vi.mocked(db.event.findMany).mockResolvedValue([] as never)
})

describe('resolvePublisherCadence — dispatch', () => {
  it('returns EMPTY_CADENCE (anchored=false) when neither excludeId is set', async () => {
    const result = await resolvePublisherCadence(db, {
      ...DEFAULT_ARGS,
      excludePartAssignmentId: null,
      excludeServiceAssignmentId: null,
    })

    expect(result.anchored).toBe(false)
    expect(result.savedMatchesSelection).toBe(false)
  })

  it('returns EMPTY_CADENCE (anchored=false) when the part assignment cannot be found', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue(null as never)

    const result = await resolvePublisherCadence(db, DEFAULT_ARGS)

    expect(result.anchored).toBe(false)
  })

  it('returns EMPTY_CADENCE (anchored=false) when the service assignment cannot be found', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue(null as never)

    const result = await resolvePublisherCadence(db, {
      ...DEFAULT_ARGS,
      excludePartAssignmentId: null,
      excludeServiceAssignmentId: 55,
    })

    expect(result.anchored).toBe(false)
  })

  it('returns anchored=true when a part assignment resolves', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      name: 'Bible Reading',
      section: 'Ministry',
      assigneeId: 5,
      assistantId: null,
    } as never)

    const result = await resolvePublisherCadence(db, DEFAULT_ARGS)

    expect(result.anchored).toBe(true)
  })

  it('returns anchored=true when a service assignment resolves', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      name: 'Sono',
      assigneeId: 5,
    } as never)

    const result = await resolvePublisherCadence(db, {
      ...DEFAULT_ARGS,
      excludePartAssignmentId: null,
      excludeServiceAssignmentId: 55,
    })

    expect(result.anchored).toBe(true)
  })
})

describe('resolvePublisherCadence — savedMatchesSelection (parts)', () => {
  it("fires when partSlot='assignee' and the saved assigneeId matches userId", async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      name: 'X',
      section: 'Y',
      assigneeId: 5,
      assistantId: 99,
    } as never)

    const result = await resolvePublisherCadence(db, { ...DEFAULT_ARGS, partSlot: 'assignee' })

    expect(result.savedMatchesSelection).toBe(true)
  })

  it("does not fire when partSlot='assignee' but the saved assistantId matches userId (cross-slot)", async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      name: 'X',
      section: 'Y',
      assigneeId: 99,
      assistantId: 5,
    } as never)

    const result = await resolvePublisherCadence(db, { ...DEFAULT_ARGS, partSlot: 'assignee' })

    expect(result.savedMatchesSelection).toBe(false)
  })

  it("fires when partSlot='assistant' and the saved assistantId matches userId", async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      name: 'X',
      section: 'Y',
      assigneeId: 99,
      assistantId: 5,
    } as never)

    const result = await resolvePublisherCadence(db, { ...DEFAULT_ARGS, partSlot: 'assistant' })

    expect(result.savedMatchesSelection).toBe(true)
  })

  it('does not fire when the saved slot is null', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      name: 'X',
      section: 'Y',
      assigneeId: null,
      assistantId: null,
    } as never)

    const result = await resolvePublisherCadence(db, DEFAULT_ARGS)

    expect(result.savedMatchesSelection).toBe(false)
  })

  it('does not fire when the saved id is a different user', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue({
      name: 'X',
      section: 'Y',
      assigneeId: 99,
      assistantId: null,
    } as never)

    const result = await resolvePublisherCadence(db, DEFAULT_ARGS)

    expect(result.savedMatchesSelection).toBe(false)
  })
})

describe('resolvePublisherCadence — savedMatchesSelection (services)', () => {
  it('fires when the saved service assigneeId matches userId', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      name: 'Sono',
      assigneeId: 5,
    } as never)

    const result = await resolvePublisherCadence(db, {
      ...DEFAULT_ARGS,
      excludePartAssignmentId: null,
      excludeServiceAssignmentId: 55,
    })

    expect(result.savedMatchesSelection).toBe(true)
  })

  it('does not fire when the service slot is unassigned', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue({
      name: 'Sono',
      assigneeId: null,
    } as never)

    const result = await resolvePublisherCadence(db, {
      ...DEFAULT_ARGS,
      excludePartAssignmentId: null,
      excludeServiceAssignmentId: 55,
    })

    expect(result.savedMatchesSelection).toBe(false)
  })
})

describe('resolvePublisherCadence — anchor lookup filters', () => {
  it('scopes the part assignment lookup to id + congregationId', async () => {
    vi.mocked(db.eventPart.findFirst).mockResolvedValue(null as never)

    await resolvePublisherCadence(db, DEFAULT_ARGS)

    const call = vi.mocked(db.eventPart.findFirst).mock.calls[0][0]
    expect(call?.where).toEqual({ id: 77, congregationId: 1 })
    expect(call?.select).toMatchObject({ name: true, section: true, assigneeId: true, assistantId: true })
  })

  it('scopes the service assignment lookup to id + congregationId', async () => {
    vi.mocked(db.eventServicePart.findFirst).mockResolvedValue(null as never)

    await resolvePublisherCadence(db, {
      ...DEFAULT_ARGS,
      excludePartAssignmentId: null,
      excludeServiceAssignmentId: 55,
    })

    const call = vi.mocked(db.eventServicePart.findFirst).mock.calls[0][0]
    expect(call?.where).toEqual({ id: 55, congregationId: 1 })
    expect(call?.select).toMatchObject({ name: true, assigneeId: true })
  })
})
