import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    event: { findMany: vi.fn() },
    eventPart: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

const { listExternalSpeakerCadence } = await import('./list-external-speaker-cadence.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const NOW = new Date('2026-07-19T00:00:00.000Z')
const DEFAULT_ARGS = {
  externalSpeakerId: 42,
  event: { templateId: 7 as number | null, id: 100, startDate: NOW },
  congregationId: 1,
  partName: 'Discours public',
  partSection: 'Culte',
  pastCount: 6,
  futureCount: 6,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.event.findMany).mockResolvedValue([] as never)
  vi.mocked(db.eventPart.findMany).mockResolvedValue([] as never)
})

describe('listExternalSpeakerCadence — event window queries', () => {
  it('short-circuits with empty arrays when templateId is null (freeform event)', async () => {
    const result = await listExternalSpeakerCadence(db, {
      ...DEFAULT_ARGS,
      event: { ...DEFAULT_ARGS.event, templateId: null },
    })

    expect(result).toEqual({ past: [], future: [], hasHistory: false })
    expect(db.event.findMany).not.toHaveBeenCalled()
  })

  it('queries past events by templateId + congregationId with startDate < currentEvent.startDate', async () => {
    await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    const pastCall = vi.mocked(db.event.findMany).mock.calls[0][0]
    expect(pastCall?.where).toMatchObject({ templateId: 7, congregationId: 1, startDate: { lt: NOW } })
  })

  it('caps past events at pastCount ordered desc', async () => {
    await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    const pastCall = vi.mocked(db.event.findMany).mock.calls[0][0]
    expect(pastCall?.orderBy).toEqual({ startDate: 'desc' })
    expect(pastCall?.take).toBe(6)
  })

  it('caps future events at futureCount ordered asc', async () => {
    await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    const futureCall = vi.mocked(db.event.findMany).mock.calls[1][0]
    expect(futureCall?.orderBy).toEqual({ startDate: 'asc' })
    expect(futureCall?.take).toBe(6)
  })

  it('queries future events by templateId + congregationId with startDate > currentEvent.startDate', async () => {
    await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    const futureCall = vi.mocked(db.event.findMany).mock.calls[1][0]
    expect(futureCall?.where).toMatchObject({ templateId: 7, congregationId: 1, startDate: { gt: NOW } })
  })
})

describe('listExternalSpeakerCadence — assigned + personName', () => {
  it('marks assigned=true when the historical row references this external speaker', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          status: 'released',
          eventParts: [
            {
              name: 'Discours public',
              section: 'Culte',
              assigneeId: null,
              externalSpeakerId: 42,
              assignee: null,
              externalSpeaker: { name: 'Frère Martin' },
            },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
    expect(result.past[0].personName).toBe('Frère Martin')
  })

  it('marks assigned=false but resolves personName when a different external speaker held the slot', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          status: 'released',
          eventParts: [
            {
              name: 'Discours public',
              section: 'Culte',
              assigneeId: null,
              externalSpeakerId: 99,
              assignee: null,
              externalSpeaker: { name: 'Frère Autre' },
            },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
    expect(result.past[0].personName).toBe('Frère Autre')
  })

  it('resolves personName from an internal assignee when the historical row was covered in-house', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          status: 'released',
          eventParts: [
            {
              name: 'Discours public',
              section: 'Culte',
              assigneeId: 12,
              externalSpeakerId: null,
              assignee: { firstname: 'Jean', lastname: 'Dupont' },
              externalSpeaker: null,
            },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
    expect(result.past[0].personName).toBe('Jean DUPONT')
  })

  // Regression pin: when a historical row has BOTH an external speaker AND an
  // in-house assignee (via re-purposing), the external speaker name must win.
  // The FK precedence — not truthiness of the name string — is the identity
  // signal, so an external speaker with a blank name should still take the
  // external-speaker branch (yielding null rather than falling through).
  it('prefers the external speaker over the in-house assignee when both are set', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          status: 'released',
          eventParts: [
            {
              name: 'Discours public',
              section: 'Culte',
              assigneeId: 12,
              externalSpeakerId: 99,
              assignee: { firstname: 'Jean', lastname: 'Dupont' },
              externalSpeaker: { name: 'Frère Martin' },
            },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.past[0].personName).toBe('Frère Martin')
  })

  it('returns personName=null when the event has no matching part assignment', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        { id: 1, startDate: new Date('2026-04-01'), status: 'released', eventParts: [] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.past[0].personName).toBeNull()
  })

  // Past events can also carry `status: 'draft'` — the schema doesn't force
  // released on time-past events. Pin the propagation so future refactors
  // don't accidentally coerce past status to 'released'.
  it("propagates event.status as 'draft' when the past row is a draft", async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([{ id: 1, startDate: new Date('2026-04-01'), status: 'draft', eventParts: [] }] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.past[0].status).toBe('draft')
  })

  it("bucket unknown Event.status values as 'released' (fallback contract)", async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        { id: 1, startDate: new Date('2026-04-01'), status: 'cancelled', eventParts: [] },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.past[0].status).toBe('released')
  })

  it("propagates event.status as 'draft' when the future row is a draft", async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 1, startDate: new Date('2026-08-01'), status: 'draft', eventParts: [] }] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.future[0].status).toBe('draft')
  })
})

describe('listExternalSpeakerCadence — anchor matching + hasHistory', () => {
  it('ignores parts whose name does not match the anchor', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          status: 'released',
          eventParts: [
            {
              name: 'Cantique',
              section: 'Culte',
              assigneeId: null,
              externalSpeakerId: 42,
              assignee: null,
              externalSpeaker: { name: 'Frère Martin' },
            },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(false)
  })

  it('matches despite whitespace/case/diacritic drift in the historical row', async () => {
    vi.mocked(db.event.findMany)
      .mockResolvedValueOnce([
        {
          id: 1,
          startDate: new Date('2026-04-01'),
          status: 'released',
          eventParts: [
            {
              name: '  DISCOURS PUBLIC  ',
              section: 'culte',
              assigneeId: null,
              externalSpeakerId: 42,
              assignee: null,
              externalSpeaker: { name: 'Frère Martin' },
            },
          ],
        },
      ] as never)
      .mockResolvedValueOnce([] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.past[0].assigned).toBe(true)
  })

  it('hasHistory query filters eventPart on the external speaker id', async () => {
    await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    const call = vi.mocked(db.eventPart.findMany).mock.calls[0][0]
    expect(call?.where).toMatchObject({ externalSpeakerId: 42 })
  })

  it('returns hasHistory=true when the speaker held the same-name-and-section slot at some point in the past', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([{ name: 'Discours public', section: 'Culte' }] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.hasHistory).toBe(true)
  })

  it('hasHistory ignores rows whose normalized name/section do not match', async () => {
    vi.mocked(db.eventPart.findMany).mockResolvedValue([
      { name: 'Prière', section: 'Culte' },
      { name: 'Discours public', section: 'Assembly' },
    ] as never)

    const result = await listExternalSpeakerCadence(db, DEFAULT_ARGS)

    expect(result.hasHistory).toBe(false)
  })
})
