import excelJs from 'exceljs'

import { wasInactiveDuring } from '~/features/publishers/model/inactive'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType, publisherTypeReportsHours } from '~/shared/types/publisher-type'
import { escapeSpreadsheetFormula } from '~/shared/utils/escape-spreadsheet-formula'
import { formatGroupName } from '~/shared/utils/format-group-name'

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
    const monthName = date.toLocaleString(getLocale(), { month: 'long' })
    const sheetName = `${monthName} ${yearMonth}`.toUpperCase()

    const worksheet = workbook.addWorksheet(sheetName)
    worksheet.columns = [
      { header: m.activity_xlsx_col_name(), width: 25 },
      { header: m.activity_xlsx_col_groups(), width: 15 },
      { header: m.activity_xlsx_col_hours(), width: 10 },
      { header: m.activity_xlsx_col_status(), width: 12 },
      { header: m.activity_xlsx_col_studies(), width: 6 },
      { header: m.activity_xlsx_col_pioneer(), width: 6 },
      { header: m.activity_xlsx_col_remarks(), width: 40 },
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
      if (activity.type === PublisherType.PionnierPermanant) type = m.activity_xlsx_type_regular()
      if (activity.type === PublisherType.PionnierAuxiliaires) type = m.activity_xlsx_type_auxiliary()

      let hours = ''
      if (activity.isPublisher) hours = m.activity_xlsx_preached()
      if (publisherTypeReportsHours(activity.type)) hours = String(activity.hours)

      worksheet.addRow([
        escapeSpreadsheetFormula(`${activity.publisher.firstname} ${activity.publisher.lastname}`),
        activity.publisher.publisherGroup
          ? escapeSpreadsheetFormula(formatGroupName(activity.publisher.publisherGroup.name))
          : '',
        hours,
        computeStatut(activity, month, yearMonth),
        activity.studies,
        type,
        escapeSpreadsheetFormula(activity.notes ?? ''),
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
  if (wasInactiveDuring(activity.publisher.inactiveAt, year, month)) return m.activity_xlsx_status_inactive()
  if (!activity.isPublisher && (activity.hours == null || activity.hours === 0))
    return m.activity_xlsx_status_irregular()
  return m.activity_xlsx_status_regular()
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
