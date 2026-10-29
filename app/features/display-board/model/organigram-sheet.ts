import { boardPersonNameRuns } from '~/features/display-board/model/board-roster'
import { sheetContentBox } from '~/features/display-board/model/sheet-page'
import { type TextMeasurer, widestWord } from '~/features/display-board/model/sheet-text'
import type { OrganigramNode } from '~/shared/domain/organigram.queries'
import { groupLayout, toLayout } from '~/shared/domain/organigram-layout'

// The printable organigram's text size: 10.5pt, unless a name is too long for its column — the
// rosters set theirs two to a half page — and then the largest size, down to 9pt, at which every
// name fits.

const SIZES = [10.5, 10, 9.5, 9]
export const ORGANIGRAM_ROSTER_GAP = 22
export const ORGANIGRAM_NAME_GAP = 10
export const ORGANIGRAM_CHART_GAP = 18

function rosterColumnWidth(rosterCount: number): number {
  const width = sheetContentBox('portrait').width
  const roster = (width - ORGANIGRAM_ROSTER_GAP * (rosterCount - 1)) / rosterCount
  return (roster - ORGANIGRAM_NAME_GAP) / 2
}

function holdersOf(nodes: OrganigramNode[]): OrganigramNode['holders'] {
  return nodes.flatMap(node => [...node.holders, ...holdersOf(node.children)])
}

export function organigramSheetSize(tree: OrganigramNode[], measurer: TextMeasurer): number {
  const { rosters, committee } = groupLayout(toLayout(tree))
  const rosterColumn = rosterColumnWidth(Math.max(1, rosters.length))
  const chartColumn = (sheetContentBox('portrait').width - 2 * ORGANIGRAM_CHART_GAP) / 3
  const rosterNames = rosters.flatMap(roster => roster.node.holders)
  // Everywhere else a name shares a line at least as wide as a chart column.
  const otherNames = committee ? holdersOf([committee.node]) : []
  const fits = (size: number) =>
    rosterNames.every(person => widestWord(boardPersonNameRuns(person), measurer, size) <= rosterColumn) &&
    otherNames.every(person => widestWord(boardPersonNameRuns(person), measurer, size) <= chartColumn)
  return SIZES.find(fits) ?? SIZES[SIZES.length - 1]
}
