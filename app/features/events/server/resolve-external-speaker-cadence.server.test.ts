import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    programmePartAssignment: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    event: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

const { resolveExternalSpeakerCadence } = await import('./resolve-external-speaker-cadence.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const NOW = new Date('2026-07-19T00:00:00.000Z')
const DEFAULT_ARGS = {
  externalSpeakerId: 42,
  event: { templateId: 7 as number | null, id: 100, startDate: NOW },
  congregationId: 1,
  excludePartAssignmentId: 77 as number | null,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.programmePartAssignment.findMany).mockResolvedValue([] as never)
  vi.mocked(db.event.findMany).mockResolvedValue([] as never)
})

describe('resolveExternalSpeakerCadence — dispatch', () => {
  it('returns EMPTY_CADENCE when no excludePartAssignmentId is set', async () => {
    const result = await resolveExternalSpeakerCadence(db, { ...DEFAULT_ARGS, excludePartAssignmentId: null })

    expect(result.anchored).toBe(false)
    expect(result.savedMatchesSelection).toBe(false)
  })

  it('returns EMPTY_CADENCE when the anchor row is missing', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue(null as never)

    const result = await resolveExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.anchored).toBe(false)
  })

  it('returns anchored=true when the anchor row is found', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      name: 'Discours',
      section: 'Culte',
      externalSpeakerId: 42,
    } as never)

    const result = await resolveExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.anchored).toBe(true)
  })
})

describe('resolveExternalSpeakerCadence — savedMatchesSelection', () => {
  it('fires when the saved external speaker matches the URL speaker', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      name: 'Discours',
      section: 'Culte',
      externalSpeakerId: 42,
    } as never)

    const result = await resolveExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.savedMatchesSelection).toBe(true)
  })

  it('does not fire when the saved slot is unassigned', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      name: 'Discours',
      section: 'Culte',
      externalSpeakerId: null,
    } as never)

    const result = await resolveExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.savedMatchesSelection).toBe(false)
  })

  it('does not fire when the saved external speaker is a different one', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue({
      name: 'Discours',
      section: 'Culte',
      externalSpeakerId: 99,
    } as never)

    const result = await resolveExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.savedMatchesSelection).toBe(false)
  })
})

describe('resolveExternalSpeakerCadence — anchor lookup filter', () => {
  it('scopes the anchor lookup to id + congregationId', async () => {
    vi.mocked(db.programmePartAssignment.findFirst).mockResolvedValue(null as never)

    await resolveExternalSpeakerCadence(db, DEFAULT_ARGS)

    const call = vi.mocked(db.programmePartAssignment.findFirst).mock.calls[0][0]
    expect(call?.where).toEqual({ id: 77, congregationId: 1 })
    expect(call?.select).toMatchObject({ name: true, section: true, externalSpeakerId: true })
  })
})
