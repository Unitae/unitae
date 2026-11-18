import { beforeEach, describe, expect, it, vi } from 'vitest'

const giveProgramme = vi.fn()
vi.mock('~/features/events/server/give-programme.server', async importOriginal => ({
  ...(await importOriginal<typeof import('./give-programme.server')>()),
  giveProgramme: (...args: unknown[]) => giveProgramme(...args),
}))

const { createMeetingProgramme } = await import('./create-meeting-programme.server')
const { ProgrammeExistsError } = await import('./programme-creation.server')

const db = {
  event: { findFirst: vi.fn(), update: vi.fn() },
  eventTemplate: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
}
const CTX = { congregationId: 7, timezone: 'America/Martinique', actorId: 42 }
const TEMPLATE = {
  id: 270,
  key: 'midweek-meeting',
  name: 'Réunion de semaine',
  weekDay: 4,
  startTime: '19:00',
  endTime: '20:45',
  parts: [{ id: 1 }],
  serviceParts: [],
}
// Thursday 19 November 2026 at 19:30 in Martinique: moved by hand from the template's 19:00.
const MEETING = {
  id: 55,
  templateId: 270,
  startDate: new Date('2026-11-19T23:30:00Z'),
  createdById: null,
  _count: { eventParts: 0, eventServiceParts: 0 },
}

beforeEach(() => {
  vi.resetAllMocks()
  db.event.findFirst.mockResolvedValue(MEETING)
  db.eventTemplate.findFirst.mockResolvedValue(TEMPLATE)
  giveProgramme.mockResolvedValue({ id: 55, templateId: 270, day: '2026-11-19' })
})

describe('createMeetingProgramme', () => {
  it('gives the meeting its template’s programme on its own day, as a meeting that already existed', async () => {
    const created = await createMeetingProgramme(db as never, 55, CTX)

    expect(created).toEqual({ id: 55, templateId: 270, day: '2026-11-19' })
    expect(giveProgramme).toHaveBeenCalledWith(db, TEMPLATE, 55, '2026-11-19', CTX, { reused: true })
  })

  // Whoever creates the programme prepares the meeting; its name and hours, perhaps moved for that week, stay.
  it('records who prepared it and leaves its name and hours alone', async () => {
    await createMeetingProgramme(db as never, 55, CTX)

    expect(db.event.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 55, congregationId: 7 } },
      data: { createdById: 42, origin: 'manual' },
    })
  })

  it('locks the template before reading what the meeting holds, so two clicks never copy it twice', async () => {
    const order: string[] = []
    db.$queryRaw.mockImplementation(() => {
      order.push('lock')
      return Promise.resolve([])
    })
    db.event.findFirst.mockImplementation(() => {
      order.push('read')
      return Promise.resolve(MEETING)
    })

    await createMeetingProgramme(db as never, 55, CTX)

    expect(order).toEqual(['read', 'lock', 'read'])
  })

  it('refuses a meeting that already has a programme', async () => {
    db.event.findFirst.mockResolvedValue({ ...MEETING, _count: { eventParts: 3, eventServiceParts: 0 } })

    await expect(createMeetingProgramme(db as never, 55, CTX)).rejects.toBeInstanceOf(ProgrammeExistsError)
    expect(giveProgramme).not.toHaveBeenCalled()
  })

  it('finds nothing for an event without a template, of another congregation, or of a system template', async () => {
    db.event.findFirst.mockResolvedValueOnce({ ...MEETING, templateId: null })
    expect(await createMeetingProgramme(db as never, 55, CTX)).toBeNull()

    db.event.findFirst.mockResolvedValueOnce(null)
    expect(await createMeetingProgramme(db as never, 55, CTX)).toBeNull()

    db.eventTemplate.findFirst.mockResolvedValue({ ...TEMPLATE, key: 'freeform' })
    expect(await createMeetingProgramme(db as never, 55, CTX)).toBeNull()
    expect(giveProgramme).not.toHaveBeenCalled()
  })
})
