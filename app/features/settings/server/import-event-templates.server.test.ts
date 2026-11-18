import { beforeEach, describe, expect, it, vi } from 'vitest'

const readNdjsonFile = vi.fn()
vi.mock('./ndjson-archive', () => ({ readNdjsonFile: (...args: unknown[]) => readNdjsonFile(...args) }))
const warn = vi.fn()
vi.mock('~/shared/infra/logger.server', () => ({ createLogger: () => ({ warn, info: vi.fn() }) }))

const { importEventTemplates } = await import('./import-event-templates.server')
const { EntityIdMap } = await import('./data-transfer.type')

const db = {
  eventTemplate: {
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 900 }),
  },
}

const template = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  name: 'Réunion de semaine',
  key: 'midweek-meeting',
  description: '',
  weekDay: 4,
  isRecurring: true,
  color: '#3b82f6',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  db.eventTemplate.create.mockResolvedValue({ id: 900 })
})

describe('importEventTemplates — attendance', () => {
  it('keeps an existing template’s kind when the archive predates attendance (before 2.15)', async () => {
    db.eventTemplate.findFirst.mockResolvedValue({ id: 30 })
    readNdjsonFile.mockResolvedValue([template()])

    await importEventTemplates({} as never, db as never, new EntityIdMap(), 1)

    const [[{ data }]] = db.eventTemplate.update.mock.calls
    expect(data).not.toHaveProperty('attendanceKind')
  })

  it('restores the kind an archive carries', async () => {
    db.eventTemplate.findFirst.mockResolvedValue({ id: 30 })
    readNdjsonFile.mockResolvedValue([template({ attendanceKind: 'none' })])

    await importEventTemplates({} as never, db as never, new EntityIdMap(), 1)

    expect(db.eventTemplate.update.mock.calls[0][0].data.attendanceKind).toBe('none')
  })

  it('gives a new template from an older archive the default of its key, as the migration did', async () => {
    db.eventTemplate.findFirst.mockResolvedValue(null)
    readNdjsonFile.mockResolvedValue([
      template(),
      template({ id: 4, key: 'memorial' }),
      template({ id: 5, key: 'field-service' }),
    ])

    await importEventTemplates({} as never, db as never, new EntityIdMap(), 1)

    expect(db.eventTemplate.create.mock.calls.map(([{ data }]) => data.attendanceKind)).toEqual([
      'midweek',
      'separate',
      'none',
    ])
  })

  // A kind this version does not know (a newer archive, a hand edit) must not silently stop a meeting from counting.
  it('keeps an existing template’s kind when the archive’s is unknown, and says so', async () => {
    db.eventTemplate.findFirst.mockResolvedValue({ id: 30 })
    readNdjsonFile.mockResolvedValue([template({ attendanceKind: 'circuit' })])

    await importEventTemplates({} as never, db as never, new EntityIdMap(), 1)

    expect(db.eventTemplate.update.mock.calls[0][0].data).not.toHaveProperty('attendanceKind')
    expect(warn).toHaveBeenCalled()
  })

  it('gives a new template with an unknown kind the default of its key, and says so', async () => {
    db.eventTemplate.findFirst.mockResolvedValue(null)
    readNdjsonFile.mockResolvedValue([template({ attendanceKind: 'circuit' })])

    await importEventTemplates({} as never, db as never, new EntityIdMap(), 1)

    expect(db.eventTemplate.create.mock.calls[0][0].data.attendanceKind).toBe('midweek')
    expect(warn).toHaveBeenCalled()
  })
})

describe('importEventTemplates — hours', () => {
  // Before v2.16 the archive had no hours: every restored template fell back to 19:00 – 21:00, and the meetings
  // created ahead took those hours.
  it('restores the hours an archive carries, on an existing template and a new one', async () => {
    db.eventTemplate.findFirst.mockResolvedValueOnce({ id: 30 }).mockResolvedValueOnce(null)
    readNdjsonFile.mockResolvedValue([
      template({ startTime: '19:30', endTime: '21:15' }),
      template({ id: 4, key: 'weekend-meeting', startTime: '10:00', endTime: '11:45' }),
    ])

    await importEventTemplates({} as never, db as never, new EntityIdMap(), 1)

    const updated = db.eventTemplate.update.mock.calls[0][0].data
    const created = db.eventTemplate.create.mock.calls[0][0].data
    expect([updated.startTime, updated.endTime, created.startTime, created.endTime]).toEqual([
      '19:30',
      '21:15',
      '10:00',
      '11:45',
    ])
  })

  it('leaves an existing template’s hours alone when the archive has none (before v2.16)', async () => {
    db.eventTemplate.findFirst.mockResolvedValue({ id: 30 })
    readNdjsonFile.mockResolvedValue([template()])

    await importEventTemplates({} as never, db as never, new EntityIdMap(), 1)

    const [[{ data }]] = db.eventTemplate.update.mock.calls
    expect(data).not.toHaveProperty('startTime')
    expect(data).not.toHaveProperty('endTime')
  })
})
