import excelJs from 'exceljs'

import { wasInactiveDuring } from '~/features/publishers/model/inactive'
import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType, publisherTypeReportsHours } from '~/shared/types/publisher-type'

type MonthlyActivities = {
  month: number
  year: number
  activities: Awaited<ReturnType<typeof getPublishersMonthlyActivity>>
}

const THEOCRATIC_YEAR_MONTHS = Array.from({ length: 12 }, (_, i) => (i + 8 > 11 ? i - 4 : i + 8))

export function getPublishersYearlyActivities(
  db: TransactionClient,
  congregationId: number,
  year: number,
): Promise<MonthlyActivities[]> {
  return Promise.all(
    THEOCRATIC_YEAR_MONTHS.map(async month => {
      const yearMonth = month < 8 ? year + 1 : year
      const activities = await getPublishersMonthlyActivity(db, congregationId, month, yearMonth)
      return { month, year: yearMonth, activities }
    }),
  )
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex report generation logic
export async function buildPublishersYearlyActivityXlsx(months: MonthlyActivities[]) {
  const workbook = new excelJs.Workbook()

  for (const { month, year: yearMonth, activities } of months) {
    const date = new Date(yearMonth, month, 1)
    const monthName = date.toLocaleString('fr', { month: 'long' })
    const sheetName = `${monthName} ${yearMonth}`.toUpperCase()

    const worksheet = workbook.addWorksheet(sheetName)
    worksheet.columns = [
      { header: 'Nom,Prénom', width: 25 },
      { header: 'Groupes', width: 15 },
      { header: 'Heures', width: 10 },
      { header: 'Statut', width: 12 },
      { header: 'Études', width: 6 },
      { header: 'Pion', width: 6 },
      { header: 'Observations', width: 40 },
    ]
    for (let col = 1; col <= 7; col++) {
      worksheet.getColumn(col).alignment = { vertical: 'middle', horizontal: 'center' }
      worksheet.getColumn(col).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      }
    }

    worksheet.getRow(1).font = { bold: true }

    for (const activity of activities) {
      let type = ''
      if (activity.type === PublisherType.PionnierPermanant) type = 'PP'
      if (activity.type === PublisherType.PionnierAuxiliaires) type = 'PA'

      let hours = ''
      if (activity.isPublisher) hours = 'A préché'
      if (publisherTypeReportsHours(activity.type)) hours = String(activity.hours)

      worksheet.addRow([
        `${activity.publisher.firstname} ${activity.publisher.lastname}`,
        activity.publisher.publisherGroup?.name.toLocaleUpperCase() ?? '',
        hours,
        computeStatut(activity, month, yearMonth),
        activity.studies,
        type,
        activity.notes,
      ])
    }
  }

  return await workbook.xlsx.writeBuffer()
}

function computeStatut(
  activity: { isPublisher: boolean; hours: number | null; publisher: { inactiveAt: Date | null } },
  month: number,
  year: number,
): string {
  if (wasInactiveDuring(activity.publisher.inactiveAt, year, month)) return 'Inactif'
  if (!activity.isPublisher && (activity.hours == null || activity.hours === 0)) return 'Irrégulier'
  return 'Régulier'
}

function getPublishersMonthlyActivity(db: TransactionClient, congregationId: number, month: number, year: number) {
  return db.publisherActivity.findMany({
    where: {
      month,
      year,
      congregationId,
    },
    include: {
      publisher: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          inactiveAt: true,
          publisherGroup: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  })
}
