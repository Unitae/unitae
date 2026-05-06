import excelJs from 'exceljs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    publisherActivity: { findMany: vi.fn() },
  },
}))

const { buildPublishersYearlyActivityXlsx, getPublishersYearlyActivities } = await import(
  './generate-publishers-yearly-activity-xlsx.server'
)
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.publisherActivity.findMany).mockResolvedValue([] as never)
})

function makeActivity(type: PublisherType, { hours = 0, studies = 0, isPublisher = true, notes = '' } = {}) {
  return {
    type,
    hours,
    studies,
    isPublisher,
    notes,
    publisher: {
      id: 1,
      firstname: 'Jean',
      lastname: 'Dupont',
      publisherGroup: { id: 1, name: 'Groupe A' },
    },
  }
}

async function readWorkbook(buffer: excelJs.Buffer) {
  const workbook = new excelJs.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

async function buildFromActivities(activities: ReturnType<typeof makeActivity>[]) {
  vi.mocked(db.publisherActivity.findMany).mockResolvedValue(activities as never)
  const months = await getPublishersYearlyActivities(db, 1, 2025)
  return readWorkbook(await buildPublishersYearlyActivityXlsx(months))
}

describe('getPublishersYearlyActivities', () => {
  it('queries the 12 months of the theocratic year (September to August)', async () => {
    await getPublishersYearlyActivities(db, 1, 2025)

    const calls = vi.mocked(db.publisherActivity.findMany).mock.calls
    const monthYearPairs = calls
      .map(call => {
        const where = (call[0] as { where: { month: number; year: number } }).where
        return { month: where.month, year: where.year }
      })
      .sort((a, b) => a.year - b.year || a.month - b.month)

    expect(monthYearPairs).toEqual([
      { month: 8, year: 2025 },
      { month: 9, year: 2025 },
      { month: 10, year: 2025 },
      { month: 11, year: 2025 },
      { month: 0, year: 2026 },
      { month: 1, year: 2026 },
      { month: 2, year: 2026 },
      { month: 3, year: 2026 },
      { month: 4, year: 2026 },
      { month: 5, year: 2026 },
      { month: 6, year: 2026 },
      { month: 7, year: 2026 },
    ])
  })

  it('scopes every query to the given congregation', async () => {
    await getPublishersYearlyActivities(db, 42, 2025)

    const calls = vi.mocked(db.publisherActivity.findMany).mock.calls
    for (const call of calls) {
      const where = (call[0] as { where: { congregationId: number } }).where
      expect(where.congregationId).toBe(42)
    }
  })
})

describe('buildPublishersYearlyActivityXlsx', () => {
  it('does not query the database', async () => {
    await buildPublishersYearlyActivityXlsx([])

    expect(db.publisherActivity.findMany).not.toHaveBeenCalled()
  })

  it('produces 12 sheets for a theocratic year', async () => {
    const workbook = await buildFromActivities([])

    expect(workbook.worksheets).toHaveLength(12)
  })

  it('shows "A préché" for a normal publisher', async () => {
    const workbook = await buildFromActivities([
      makeActivity(PublisherType.Normal, { isPublisher: true, hours: 0, studies: 1 }),
    ])
    const dataRow = workbook.worksheets[0].getRow(2)

    expect(dataRow.getCell(3).value).toBe('A préché')
  })

  it('shows hours for a permanent pioneer', async () => {
    const workbook = await buildFromActivities([makeActivity(PublisherType.PionnierPermanant, { hours: 50 })])
    const dataRow = workbook.worksheets[0].getRow(2)

    expect(dataRow.getCell(3).value).toBe('50')
  })

  it('shows hours for an auxiliary pioneer', async () => {
    const workbook = await buildFromActivities([makeActivity(PublisherType.PionnierAuxiliaires, { hours: 30 })])
    const dataRow = workbook.worksheets[0].getRow(2)

    expect(dataRow.getCell(3).value).toBe('30')
  })

  it('shows hours for a special pioneer', async () => {
    const workbook = await buildFromActivities([makeActivity(PublisherType.PionnierSpecial, { hours: 130 })])
    const dataRow = workbook.worksheets[0].getRow(2)

    expect(dataRow.getCell(3).value).toBe('130')
  })

  it('shows hours for a missionary', async () => {
    const workbook = await buildFromActivities([makeActivity(PublisherType.Missionnaire, { hours: 120 })])
    const dataRow = workbook.worksheets[0].getRow(2)

    expect(dataRow.getCell(3).value).toBe('120')
  })
})
