import excelJs from 'exceljs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    publisherActivity: { findMany: vi.fn() },
  },
}))

const { generatePublishersYearlyActivityXlsx } = await import('./generate-publishers-yearly-activity-xlsx.server')
const { db } = await import('~/shared/libs/db.server')

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

describe('generatePublishersYearlyActivityXlsx', () => {
  it('génère 12 feuilles pour une année théocratique', async () => {
    const buffer = await generatePublishersYearlyActivityXlsx(db, 1, 2025)
    const workbook = await readWorkbook(buffer)

    expect(workbook.worksheets).toHaveLength(12)
  })

  it('affiche "A préché" pour un proclamateur normal', async () => {
    vi.mocked(db.publisherActivity.findMany).mockResolvedValue([
      makeActivity(PublisherType.Normal, { isPublisher: true, hours: 0, studies: 1 }),
    ] as never)

    const buffer = await generatePublishersYearlyActivityXlsx(db, 1, 2025)
    const workbook = await readWorkbook(buffer)
    const firstSheet = workbook.worksheets[0]
    const dataRow = firstSheet.getRow(2)

    expect(dataRow.getCell(3).value).toBe('A préché')
  })

  it('affiche les heures pour un pionnier permanent', async () => {
    vi.mocked(db.publisherActivity.findMany).mockResolvedValue([
      makeActivity(PublisherType.PionnierPermanant, { hours: 50 }),
    ] as never)

    const buffer = await generatePublishersYearlyActivityXlsx(db, 1, 2025)
    const workbook = await readWorkbook(buffer)
    const dataRow = workbook.worksheets[0].getRow(2)

    expect(dataRow.getCell(3).value).toBe('50')
  })

  it('affiche les heures pour un pionnier auxiliaire', async () => {
    vi.mocked(db.publisherActivity.findMany).mockResolvedValue([
      makeActivity(PublisherType.PionnierAuxiliaires, { hours: 30 }),
    ] as never)

    const buffer = await generatePublishersYearlyActivityXlsx(db, 1, 2025)
    const workbook = await readWorkbook(buffer)
    const dataRow = workbook.worksheets[0].getRow(2)

    expect(dataRow.getCell(3).value).toBe('30')
  })

  it('affiche les heures pour un pionnier spécial', async () => {
    vi.mocked(db.publisherActivity.findMany).mockResolvedValue([
      makeActivity(PublisherType.PionnierSpecial, { hours: 130 }),
    ] as never)

    const buffer = await generatePublishersYearlyActivityXlsx(db, 1, 2025)
    const workbook = await readWorkbook(buffer)
    const dataRow = workbook.worksheets[0].getRow(2)

    expect(dataRow.getCell(3).value).toBe('130')
  })

  it('affiche les heures pour un missionnaire', async () => {
    vi.mocked(db.publisherActivity.findMany).mockResolvedValue([
      makeActivity(PublisherType.Missionnaire, { hours: 120 }),
    ] as never)

    const buffer = await generatePublishersYearlyActivityXlsx(db, 1, 2025)
    const workbook = await readWorkbook(buffer)
    const dataRow = workbook.worksheets[0].getRow(2)

    expect(dataRow.getCell(3).value).toBe('120')
  })
})
