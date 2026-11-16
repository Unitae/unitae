import { beforeEach, describe, expect, it, vi } from 'vitest'

const readNdjsonFile = vi.fn()
vi.mock('./ndjson-archive', () => ({ readNdjsonFile: (...args: unknown[]) => readNdjsonFile(...args) }))
vi.mock('~/shared/infra/logger.server', () => ({ createLogger: () => ({ warn: vi.fn(), info: vi.fn() }) }))

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

  it('reads a kind it does not know as not counted', async () => {
    db.eventTemplate.findFirst.mockResolvedValue(null)
    readNdjsonFile.mockResolvedValue([template({ attendanceKind: 'monthly' })])

    await importEventTemplates({} as never, db as never, new EntityIdMap(), 1)

    expect(db.eventTemplate.create.mock.calls[0][0].data.attendanceKind).toBe('none')
  })
})
