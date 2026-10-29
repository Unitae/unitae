import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOARD_LAYOUTS, BOARD_TYPEFACES } from '~/features/display-board/model/board-appearance'
import { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { organigramTree, printedName, resetPeople } from './__fixtures__/board-sheets'
import { expectInsideMargins, expectNoOverlap, expectPrinted, renderSheet } from './__fixtures__/render-sheet'

// The organigram in every look and layout: the standard chart on one page, and a congregation
// three times its size running over pages without losing anyone.

vi.setConfig({ testTimeout: 60_000 })

beforeEach(() => resetPeople())

/** Everyone the sheet prints: the rosters' members, and every service's leaders and deputies. */
function printedPeople(tree: OrganigramNode[]): string[] {
  return tree.flatMap(node => [
    ...node.holders.filter(holder => node.isRoster || holder.kind !== 'member').map(printedName),
    ...printedPeople(node.children),
  ])
}

describe.each(BOARD_TYPEFACES)('the organigram in %s', typeface => {
  describe.each(BOARD_LAYOUTS[DynamicType.Organigram])('as %s', layout => {
    it('holds the standard chart on one page, everyone printed', async () => {
      const tree = organigramTree()

      const pages = await renderSheet({ type: DynamicType.Organigram, tree }, { typeface, accent: 'indigo', layout })

      expect(pages).toHaveLength(1)
      expectPrinted(pages, printedPeople(tree))
      expectInsideMargins(pages)
      expectNoOverlap(pages)
    })

    it('runs a large congregation over the pages it needs rather than lose anyone', async () => {
      const tree = organigramTree(3)

      const pages = await renderSheet({ type: DynamicType.Organigram, tree }, { typeface, accent: 'black', layout })

      expectPrinted(pages, printedPeople(tree))
      expectInsideMargins(pages)
      expectNoOverlap(pages)
    })
  })
})
