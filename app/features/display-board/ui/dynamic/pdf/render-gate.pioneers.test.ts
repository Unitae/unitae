import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOARD_LAYOUTS, BOARD_TYPEFACES } from '~/features/display-board/model/board-appearance'
import { auxiliaryMonthLabel } from '~/features/display-board/model/board-roster'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import { fitPioneersSheet } from '~/features/display-board/model/pioneers-sheet'
import { loadBoardPdfTypeface } from '~/features/display-board/server/board-pdf-fonts.server'
import { pioneerList, printedName, resetPeople } from './__fixtures__/board-sheets'
import {
  expectInsideMargins,
  expectNoOverlap,
  expectPrinted,
  printedText,
  renderSheet,
  SHEET_TIMEZONE,
} from './__fixtures__/render-sheet'

// The pioneers sheet in every look and layout: a usual month on one page, and a campaign month's
// long list of auxiliaries still on one page, every name printed.

vi.setConfig({ testTimeout: 60_000 })

// Printed in September, the longest month name in French: the auxiliaries' heading is planned and
// printed at its widest, the same word in both.
const SEPTEMBER = new Date('2026-09-28T10:00:00Z')

beforeEach(() => resetPeople())

describe.each(BOARD_TYPEFACES)('the pioneers sheet in %s', typeface => {
  describe.each(BOARD_LAYOUTS[DynamicType.Pioneers])('as %s', layout => {
    it.each([
      ['a usual month', [14, 1, 26]],
      ['a campaign month with 70 auxiliaries', [14, 1, 70]],
    ] as const)('holds %s on one page, every name printed', async (_, [permanent, special, auxiliary]) => {
      const pioneers = pioneerList(permanent, special, auxiliary)

      const appearance = { typeface, accent: 'plum', layout } as const
      const pages = await renderSheet({ type: DynamicType.Pioneers, pioneers }, appearance, { asOf: SEPTEMBER })
      const month = auxiliaryMonthLabel(SEPTEMBER, SHEET_TIMEZONE)
      const plan = fitPioneersSheet(layout, pioneers, await loadBoardPdfTypeface(typeface), month)

      expect(month).toBe('septembre')
      expect(printedText(pages), 'the heading prints the month measured').toContain(month)
      expect(plan.fitsOnePage).toBe(true)
      expect(pages).toHaveLength(1)
      expectPrinted(pages, pioneers.map(printedName))
      expectInsideMargins(pages)
      expectNoOverlap(pages)
    })
  })
})
