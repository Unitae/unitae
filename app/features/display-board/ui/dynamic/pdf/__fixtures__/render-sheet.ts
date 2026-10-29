import { expect } from 'vitest'
import type { BoardAppearance } from '~/features/display-board/model/board-appearance'
import { SHEET_MARGIN } from '~/features/display-board/model/sheet-page'
import { type BoardSheetData, buildBoardSheet } from '~/features/display-board/ui/dynamic/pdf/board-sheet'
import { renderPdfResponse } from '~/shared/infra/pdf.server'
import { type PdfPage, readPdf } from '~/tests/helpers/pdf-text'

// Renders a board sheet the way the download route does, and reads it back, for the tests that
// check what every combination of look and layout actually prints.

export async function renderSheet(data: BoardSheetData, appearance: BoardAppearance): Promise<PdfPage[]> {
  const sheet = await buildBoardSheet(data, appearance, {
    title: 'Feuille d’essai',
    congregationName: 'Assemblée de Paris Batignolles',
    asOf: new Date('2026-10-28T10:00:00Z'),
    timezone: 'Europe/Paris',
  })
  const response = await renderPdfResponse(sheet, 'sheet.pdf')
  expect(response.status, 'the sheet renders').toBe(200)
  return readPdf(await response.arrayBuffer())
}

export function printedText(pages: PdfPage[]): string {
  return pages.map(page => page.text).join(' ')
}

/** Every name on the sheet, each the number of times expected (once, unless said otherwise). */
export function expectPrinted(pages: PdfPage[], names: string[]) {
  const text = ` ${printedText(pages)} `
  const missing = names.filter(name => !text.includes(` ${name} `))
  expect(missing, 'names missing from the sheet').toEqual([])
}

export function countPrinted(pages: PdfPage[], name: string): number {
  return ` ${printedText(pages)} `.split(` ${name} `).length - 1
}

/** No text crosses the margins: a word wider than its column would push past the page's edge. */
export function expectInsideMargins(pages: PdfPage[]) {
  const outside = pages.flatMap((page, index) =>
    page.items
      .filter(
        item =>
          item.x < SHEET_MARGIN.horizontal - 1 ||
          item.x + item.width > page.width - SHEET_MARGIN.horizontal + 1 ||
          item.y + item.height > page.height - SHEET_MARGIN.top + 2,
      )
      .map(item => `page ${index + 1}: « ${item.str} »`),
  )
  expect(outside, 'text outside the margins').toEqual([])
}

/** No two pieces of text on one line overlap: a name spilling into the next column would. */
export function expectNoOverlap(pages: PdfPage[]) {
  const overlaps: string[] = []
  pages.forEach((page, index) => {
    const lines = new Map<number, PdfPage['items']>()
    for (const item of page.items) {
      const baseline = Math.round(item.y * 2) / 2
      lines.set(baseline, [...(lines.get(baseline) ?? []), item])
    }
    for (const line of lines.values()) {
      const sorted = [...line].sort((a, b) => a.x - b.x)
      for (let at = 1; at < sorted.length; at++) {
        const [left, right] = [sorted[at - 1], sorted[at]]
        if (right.x < left.x + left.width - 0.75) overlaps.push(`page ${index + 1}: « ${left.str} » / « ${right.str} »`)
      }
    }
  })
  expect(overlaps, 'overlapping text').toEqual([])
}
