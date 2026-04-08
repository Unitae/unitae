import excelJs from 'exceljs'

import { db } from '~/shared/libs/db.server'
import { PublisherType } from '~/shared/types/publisher-type'

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex report generation logic
export async function generatePublishersYearlyActivityXlsx(year: number) {
  const months = Array.from({ length: 12 }, (_, i) => (i + 8 > 11 ? i - 4 : i + 8))
  const workbook = new excelJs.Workbook()

  for (const month of months) {
    const yearMonth = month < 8 ? year + 1 : year
    const date = new Date(yearMonth, month, 1)
    const monthName = date.toLocaleString('fr', { month: 'long' })
    const sheetName = `${monthName} ${yearMonth}`.toUpperCase()
    const activities = await getPublishersMonthlyActivity(month, yearMonth)

    const worksheet = workbook.addWorksheet(sheetName)
    worksheet.columns = [
      { header: 'Nom,Prénom', width: 25 },
      { header: 'Groupes', width: 15 },
      { header: 'Heures', width: 10 },
      { header: 'Études', width: 6 },
      { header: 'Pion', width: 6 },
      { header: 'Observations', width: 40 },
    ]
    worksheet.getColumn(1).alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.getColumn(2).alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.getColumn(3).alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.getColumn(4).alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.getColumn(5).alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.getColumn(6).alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.getColumn(1).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
    worksheet.getColumn(2).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
    worksheet.getColumn(3).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
    worksheet.getColumn(4).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
    worksheet.getColumn(5).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
    worksheet.getColumn(6).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }

    worksheet.getRow(1).font = { bold: true }

    for (const activity of activities) {
      let type = ''
      if (activity.type === PublisherType.PionnierPermanant) type = 'PP'
      if (activity.type === PublisherType.PionnierAuxiliaires) type = 'PA'

      let hours = ''
      if (activity.isPublisher) hours = 'A préché'
      if (activity.type === PublisherType.PionnierPermanant) hours = String(activity.hours)

      worksheet.addRow([
        `${activity.publisher.firstname} ${activity.publisher.lastname}`,
        activity.publisher.publisherGroup?.name.toLocaleUpperCase() ?? '',
        hours,
        activity.studies,
        type,
        activity.notes,
      ])
    }
  }

  return await workbook.xlsx.writeBuffer()
}

function getPublishersMonthlyActivity(month: number, year: number) {
  return db.publisherActivity.findMany({
    where: {
      month,
      year,
    },
    include: {
      publisher: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
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
