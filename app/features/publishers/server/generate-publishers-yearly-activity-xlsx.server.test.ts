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

function makeActivity(
  type: PublisherType,
  { hours = 0, studies = 0, isPublisher = true, notes = '', inactiveAt = null as Date | null } = {},
) {
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
      inactiveAt,
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

  it('writes one row per activity with the group name uppercased', async () => {
    const activities = [
      {
        ...makeActivity(PublisherType.Normal, { isPublisher: true }),
        publisher: {
          id: 1,
          firstname: 'Alice',
          lastname: 'Martin',
          publisherGroup: { id: 1, name: 'Groupe A' },
          inactiveAt: null,
        },
      },
      {
        ...makeActivity(PublisherType.PionnierPermanant, { hours: 60 }),
        publisher: {
          id: 2,
          firstname: 'Bob',
          lastname: 'Durand',
          publisherGroup: { id: 2, name: 'Groupe B' },
          inactiveAt: null,
        },
      },
    ]
    const workbook = await buildFromActivities(activities)
    const sheet = workbook.worksheets[0]

    expect(sheet.getRow(2).getCell(1).value).toBe('Alice Martin')
    expect(sheet.getRow(2).getCell(2).value).toBe('GROUPE A')
    expect(sheet.getRow(3).getCell(1).value).toBe('Bob Durand')
    expect(sheet.getRow(3).getCell(2).value).toBe('GROUPE B')
    expect(sheet.getRow(3).getCell(3).value).toBe('60')
  })

  it('adds a Statut column after Heures with "Régulier" for a preaching publisher', async () => {
    const workbook = await buildFromActivities([
      makeActivity(PublisherType.Normal, { isPublisher: true, hours: 0, studies: 1 }),
    ])
    const sheet = workbook.worksheets[0]

    expect(sheet.getRow(1).getCell(4).value).toBe('Statut')
    expect(sheet.getRow(2).getCell(4).value).toBe('Régulier')
  })

  it('sets Statut to "Irrégulier" for a report with isPublisher=false and no hours', async () => {
    const workbook = await buildFromActivities([
      makeActivity(PublisherType.Normal, { isPublisher: false, hours: 0, studies: 0 }),
    ])
    const sheet = workbook.worksheets[0]

    expect(sheet.getRow(2).getCell(4).value).toBe('Irrégulier')
  })

  it('sets Statut to "Inactif" when the row month is at or after the publisher inactiveAt', async () => {
    // September 2025 is the first sheet (theocratic year starts month 8 = September).
    // A publisher marked inactive on 2025-08-15 covers September 2025.
    const workbook = await buildFromActivities([
      makeActivity(PublisherType.Normal, {
        isPublisher: false,
        hours: 0,
        inactiveAt: new Date(2025, 7, 15),
      }),
    ])
    const sheet = workbook.worksheets[0]

    expect(sheet.getRow(2).getCell(4).value).toBe('Inactif')
  })

  it('keeps Statut on "Régulier" / "Irrégulier" for months before inactiveAt', async () => {
    // A publisher with inactiveAt in April 2026 — the September 2025 row (before
    // inactivation) still reflects their actual state at the time.
    vi.mocked(db.publisherActivity.findMany).mockImplementation(((args: { where: { month: number; year: number } }) => {
      const { where } = args
      if (where.month === 8 && where.year === 2025) {
        return Promise.resolve([
          makeActivity(PublisherType.Normal, {
            isPublisher: false,
            hours: 0,
            inactiveAt: new Date(2026, 3, 10),
          }),
        ])
      }
      if (where.month === 3 && where.year === 2026) {
        return Promise.resolve([
          makeActivity(PublisherType.Normal, {
            isPublisher: false,
            hours: 0,
            inactiveAt: new Date(2026, 3, 10),
          }),
        ])
      }
      return Promise.resolve([])
    }) as never)

    const months = await getPublishersYearlyActivities(db, 1, 2025)
    const workbook = await readWorkbook(await buildPublishersYearlyActivityXlsx(months))

    const september2025 = workbook.worksheets.find(sheet => sheet.name === 'SEPTEMBRE 2025')
    const april2026 = workbook.worksheets.find(sheet => sheet.name === 'AVRIL 2026')

    expect(september2025?.getRow(2).getCell(4).value).toBe('Irrégulier')
    expect(april2026?.getRow(2).getCell(4).value).toBe('Inactif')
  })

  it('puts each month in its own sheet with the right activities', async () => {
    vi.mocked(db.publisherActivity.findMany).mockImplementation(((args: { where: { month: number; year: number } }) => {
      const { where } = args
      if (where.month === 8 && where.year === 2025) {
        return Promise.resolve([{ ...makeActivity(PublisherType.Normal, { isPublisher: true }) }])
      }
      if (where.month === 0 && where.year === 2026) {
        return Promise.resolve([
          { ...makeActivity(PublisherType.Normal, { isPublisher: true }) },
          { ...makeActivity(PublisherType.PionnierAuxiliaires, { hours: 30 }) },
        ])
      }
      return Promise.resolve([])
    }) as never)

    const months = await getPublishersYearlyActivities(db, 1, 2025)
    const workbook = await readWorkbook(await buildPublishersYearlyActivityXlsx(months))

    const september2025 = workbook.worksheets.find(sheet => sheet.name === 'SEPTEMBRE 2025')
    const january2026 = workbook.worksheets.find(sheet => sheet.name === 'JANVIER 2026')
    const february2026 = workbook.worksheets.find(sheet => sheet.name === 'FÉVRIER 2026')

    expect(september2025?.actualRowCount).toBe(2)
    expect(january2026?.actualRowCount).toBe(3)
    expect(february2026?.actualRowCount).toBe(1)
  })

  it('escapes an Observations note that starts with a formula-trigger character', async () => {
    const workbook = await buildFromActivities([makeActivity(PublisherType.Normal, { notes: '=SUM(A1:A2)' })])
    const sheet = workbook.worksheets[0]

    expect(sheet.getRow(2).getCell(7).value).toBe("'=SUM(A1:A2)")
  })

  it('escapes a publisher name that starts with a formula-trigger character', async () => {
    const workbook = await buildFromActivities([
      {
        ...makeActivity(PublisherType.Normal, { isPublisher: true }),
        publisher: {
          id: 1,
          firstname: '=cmd',
          lastname: 'Martin',
          publisherGroup: { id: 1, name: 'Groupe A' },
          inactiveAt: null,
        },
      },
    ])
    const sheet = workbook.worksheets[0]

    expect(sheet.getRow(2).getCell(1).value).toBe("'=cmd Martin")
  })
})
