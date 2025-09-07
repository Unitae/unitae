import excelJs from 'exceljs'

import type { getTerritoriesExportData } from './territories-export-data.server'

export function generateS13ExportExcel(
  data: Awaited<ReturnType<typeof getTerritoriesExportData>>,
  serviceYear: string,
) {
  const workbook = new excelJs.Workbook()
  const worksheet = workbook.addWorksheet(serviceYear)

  addExportHeaders(worksheet, serviceYear)

  const attributionMaxCount = data.reduce(
    (count, item) => (count > item.attributions.length ? count : item.attributions.length),
    0,
  )

  addHeadersForTerritories(worksheet)
  addHeadersForAttributions(worksheet, attributionMaxCount)

  // Add rows
  for (const item of data) {
    const { firstRow, lastRow, isLastTerritorry } = addRowsForTerritory(
      worksheet,
      item.id,
      item.number,
      data[data.length - 1].id,
    )

    if (firstRow == null || lastRow == null) {
      continue
    }

    const { nextColIndex } = addAttributionColumns(firstRow, lastRow, item, attributionMaxCount, isLastTerritorry)
    addEmptyAttributionColumns(nextColIndex, firstRow, lastRow, attributionMaxCount, isLastTerritorry)
  }

  worksheet.addRow([
    '* Lorsque vous commencez une nouvelle feuille, notez dans cette colonne la date à laquelle chaque territoire a été entièrement parcouru pour la dernière fois.',
  ])

  // Return the workbook
  return workbook
}

function addExportHeaders(worksheet: excelJs.Worksheet, serviceYear: string) {
  worksheet.addRow([`REGISTRE D'ATTRIBUTION DES TERRITOIRES`])
  worksheet.addRow([])
  worksheet.addRow(['Année de service :', '', serviceYear])

  worksheet.getRow(1).font = { bold: true, size: 16 }
  worksheet.getCell('A3').font = { bold: true }
}

function addHeadersForTerritories(worksheet: excelJs.Worksheet) {
  worksheet.addRow(['Terr. nº', 'Parcouru pour la dernière fois le*'])
  worksheet.addRow(['', ''])

  worksheet.getCell('A4').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  worksheet.getCell('B4').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  worksheet.getCell('A4').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'ffcfcfcf' },
  }
  worksheet.getCell('B4').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'ffcfcfcf' },
  }
  worksheet.getCell('A4').border = {
    top: { style: 'thick' },
    left: { style: 'thick' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  }
  worksheet.getCell('B4').border = {
    top: { style: 'thick' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'medium' },
  }
  worksheet.getColumn(1).width = 10
  worksheet.getColumn(2).width = 15
  worksheet.mergeCells('A4:A5')
  worksheet.mergeCells('B4:B5')
}

function addHeadersForAttributions(worksheet: excelJs.Worksheet, attributionMaxCount: number) {
  for (let i = 0; i < attributionMaxCount; i++) {
    const colIndex = 3 + i * 2
    const isLastCol = attributionMaxCount * 2 + 2 === colIndex + 1

    worksheet.getColumn(colIndex).width = 15
    worksheet.getColumn(colIndex + 1).width = 15

    const nameCell = worksheet.getCell(4, colIndex)
    nameCell.value = 'Attribué à'
    nameCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    nameCell.border = {
      top: { style: 'thick' },
      left: { style: 'medium' },
      bottom: { style: 'thin' },
      right: { style: isLastCol ? 'thick' : 'medium' },
    }
    nameCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'ffcfcfcf' },
    }
    worksheet.getCell(4, colIndex + 1).merge(nameCell)

    const dateCell = worksheet.getCell(5, colIndex)
    dateCell.value = 'Attribué le'
    dateCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    dateCell.border = {
      top: { style: 'thin' },
      left: { style: 'medium' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    }
    dateCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'ffcfcfcf' },
    }

    const endDateCell = worksheet.getCell(5, colIndex + 1)
    endDateCell.value = 'Entièrement parcouru le'
    endDateCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    endDateCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: isLastCol ? 'thick' : 'medium' },
    }
    endDateCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'ffcfcfcf' },
    }
  }
}

function addRowsForTerritory(
  worksheet: excelJs.Worksheet,
  territoryId: number,
  territoryNumber: string,
  lastTerritoryId: number,
) {
  worksheet.addRow([territoryNumber, ''])
  const firstRow = worksheet.lastRow
  worksheet.addRow(['', ''])
  const lastRow = worksheet.lastRow

  if (firstRow == null || lastRow == null) {
    return { firstRow: null, lastRow: null, isLastTerritorry: false }
  }

  const isLastRow = territoryId === lastTerritoryId

  firstRow.alignment = { vertical: 'middle', horizontal: 'center' }
  firstRow.getCell(1).border = {
    top: { style: 'thin' },
    left: { style: 'thick' },
    bottom: { style: isLastRow ? 'thick' : 'thin' },
    right: { style: 'thin' },
  }
  firstRow.getCell(2).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: isLastRow ? 'thick' : 'thin' },
    right: { style: 'medium' },
  }
  lastRow.alignment = { vertical: 'middle', horizontal: 'center' }
  lastRow.getCell(1).merge(firstRow.getCell(1))
  lastRow.getCell(2).merge(firstRow.getCell(2))

  return { firstRow, lastRow, isLastTerritorry: isLastRow }
}

function addAttributionColumns(
  firstRow: excelJs.Row,
  lastRow: excelJs.Row,
  item: Awaited<ReturnType<typeof getTerritoriesExportData>>[number],
  attributionMaxCount: number,
  isLastTerritorry: boolean,
) {
  let colIndex = 3
  const lastColIndex = 2 + attributionMaxCount * 2

  for (const attribution of item.attributions.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())) {
    const isLastCol = lastColIndex === colIndex + 1

    firstRow.getCell(colIndex).value =
      `${attribution.publisher?.firstname || ''} ${attribution.publisher?.lastname || ''}`
    firstRow.getCell(colIndex).border = {
      top: { style: 'thin' },
      left: { style: 'medium' },
      bottom: { style: 'thin' },
      right: { style: isLastCol ? 'thick' : 'medium' },
    }
    firstRow.getCell(colIndex + 1).merge(firstRow.getCell(colIndex))

    lastRow.getCell(colIndex).value = attribution.startDate ? attribution.startDate.toLocaleDateString('fr-FR') : ''
    lastRow.getCell(colIndex).border = {
      top: { style: 'thin' },
      left: { style: 'medium' },
      bottom: { style: isLastTerritorry ? 'thick' : 'thin' },
      right: { style: 'thin' },
    }
    lastRow.getCell(colIndex + 1).value = attribution.endDate ? attribution.endDate.toLocaleDateString('fr-FR') : ''
    lastRow.getCell(colIndex + 1).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: isLastTerritorry ? 'thick' : 'thin' },
      right: { style: isLastCol ? 'thick' : 'medium' },
    }

    colIndex += 2
  }

  return { nextColIndex: colIndex }
}

function addEmptyAttributionColumns(
  nextColIndex: number,
  firstRow: excelJs.Row,
  lastRow: excelJs.Row,
  attributionMaxCount: number,
  isLastTerritorry: boolean,
) {
  const lastColIndex = 2 + attributionMaxCount * 2
  for (let i = nextColIndex; i < lastColIndex + 1; i += 2) {
    const isLastCol = lastColIndex === i + 1

    const nameCell = firstRow.getCell(i)
    nameCell.border = {
      top: { style: 'thin' },
      left: { style: 'medium' },
      bottom: { style: 'thin' },
      right: { style: isLastCol ? 'thick' : 'medium' },
    }
    firstRow.getCell(i + 1).merge(nameCell)

    const dateCell = lastRow.getCell(i)
    dateCell.border = {
      top: { style: 'thin' },
      left: { style: 'medium' },
      bottom: { style: isLastTerritorry ? 'thick' : 'thin' },
      right: { style: 'thin' },
    }

    const endDateCell = lastRow.getCell(i + 1)
    endDateCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: isLastTerritorry ? 'thick' : 'thin' },
      right: { style: isLastCol ? 'thick' : 'medium' },
    }
  }
}
