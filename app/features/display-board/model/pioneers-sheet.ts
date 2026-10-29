import { balancedColumns } from '~/features/display-board/model/balanced-columns'
import type { BoardLayout } from '~/features/display-board/model/board-appearance'
import {
  type BoardPerson,
  boardPersonNameRuns,
  groupPioneersByType,
  pioneerTypeLabel,
} from '~/features/display-board/model/board-roster'
import type { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import {
  AUTO_FIT_SIZES,
  ENTRY_RULE_HEIGHT,
  mastheadHeight,
  SAFE_FILL,
  sheetContentBox,
} from '~/features/display-board/model/sheet-page'
import { lineCount, type TextMeasurer } from '~/features/display-board/model/sheet-text'

// How the printable « Pionniers » lays itself out, before react-pdf draws it:
//   sections  one section per pioneer type down the page, its names read down three columns;
//   columns   the types side by side, each heading its own list.
// The names take the largest size, from 12pt down to 9pt, that keeps the sheet on one page. In
// columns, a type too long for its column gets a second one, up to four across the page, before
// the sheet is allowed to run onto a second page; it never drops a name.

export type PioneersLayout = BoardLayout<typeof DynamicType.Pioneers>

export type SheetPioneer = BoardPerson & { type: string }

export const PIONEERS_LINE_HEIGHT = 1.4
/** The heading of a type is this much larger than the names. */
export const PIONEERS_HEADING_SCALE = 1.4
export const PIONEERS_GAP = 14
const SECTION_COLUMNS = 3
const SECTION_GAP = 16
const HEADING_GAP = 6
const MAX_COLUMNS = 4

export interface PioneersSection {
  type: string
  label: string
  pioneers: SheetPioneer[]
  /** The type's names, split into the columns they read down. */
  columns: SheetPioneer[][]
}

export interface PioneersSheetPlan {
  size: number
  sections: PioneersSection[]
  /** Columns layout: the height every heading takes, so all the lists start on one line. */
  headingHeight: number
  /** Whether the sheet holds on one page; when it doesn't, it flows rather than drop names. */
  fitsOnePage: boolean
}

const contentWidth = () => sheetContentBox('portrait').width
const capacity = () => (sheetContentBox('portrait').height - mastheadHeight()) * SAFE_FILL

function listHeight(people: SheetPioneer[], measurer: TextMeasurer, s: number, width: number): number {
  const lines = people.reduce((total, person) => total + lineCount(boardPersonNameRuns(person), measurer, s, width), 0)
  return lines * s * PIONEERS_LINE_HEIGHT
}

function split(people: SheetPioneer[], count: number, measurer: TextMeasurer, s: number, width: number) {
  return balancedColumns(people, count, person => listHeight([person], measurer, s, width))
}

function columnsHeight(columns: SheetPioneer[][], measurer: TextMeasurer, s: number, width: number): number {
  return Math.max(0, ...columns.map(column => listHeight(column, measurer, s, width)))
}

/** The width of one of `total` columns side by side across the page. */
function columnWidth(total: number): number {
  return (contentWidth() - PIONEERS_GAP * (total - 1)) / total
}

function headingLines(label: string, measurer: TextMeasurer, s: number, width: number): number {
  // The count sits at the heading's right; the title keeps clear of it.
  return lineCount([{ text: label, weight: 'bold' }], measurer, PIONEERS_HEADING_SCALE * s, width * 0.82)
}

function planSections(groups: { type: string; pioneers: SheetPioneer[] }[], measurer: TextMeasurer, s: number) {
  const width = columnWidth(SECTION_COLUMNS)
  const sections = groups.map(({ type, pioneers }) => ({
    type,
    label: pioneerTypeLabel(type),
    pioneers,
    columns: split(pioneers, SECTION_COLUMNS, measurer, s, width),
  }))
  const heading = PIONEERS_HEADING_SCALE * s * 1.2 + HEADING_GAP
  const total = sections.reduce(
    (sum, section, index) =>
      sum +
      (index > 0 ? ENTRY_RULE_HEIGHT : 0) +
      heading +
      columnsHeight(section.columns, measurer, s, width) +
      SECTION_GAP,
    0,
  )
  return { sections, headingHeight: 0, total }
}

/** Columns: one per type, then a second for whichever type runs longest, while the page has room. */
function planColumns(groups: { type: string; pioneers: SheetPioneer[] }[], measurer: TextMeasurer, s: number) {
  const counts = groups.map(() => 1)
  const layoutAt = () => {
    const total = counts.reduce((sum, count) => sum + count, 0)
    const width = columnWidth(total)
    const sections = groups.map(({ type, pioneers }, index) => ({
      type,
      label: pioneerTypeLabel(type),
      pioneers,
      columns: split(pioneers, counts[index], measurer, s, width),
    }))
    const headingHeight = Math.max(
      ...sections.map(
        (section, index) =>
          headingLines(section.label, measurer, s, width * counts[index] + PIONEERS_GAP * (counts[index] - 1)) *
          PIONEERS_HEADING_SCALE *
          s *
          1.2,
      ),
    )
    const lists = sections.map(section => columnsHeight(section.columns, measurer, s, width))
    return {
      sections,
      headingHeight,
      lists,
      total: ENTRY_RULE_HEIGHT + headingHeight + HEADING_GAP + Math.max(...lists),
    }
  }
  let current = layoutAt()
  while (
    current.total > capacity() &&
    counts.reduce((sum, count) => sum + count, 0) < Math.max(MAX_COLUMNS, groups.length)
  ) {
    const longest = current.lists.indexOf(Math.max(...current.lists))
    counts[longest] += 1
    current = layoutAt()
  }
  return current
}

export function fitPioneersSheet(
  layout: PioneersLayout,
  pioneers: SheetPioneer[],
  measurer: TextMeasurer,
): PioneersSheetPlan {
  const groups = groupPioneersByType(pioneers)
  const planAt = (s: number) =>
    layout === 'columns' ? planColumns(groups, measurer, s) : planSections(groups, measurer, s)
  for (const size of AUTO_FIT_SIZES) {
    const plan = planAt(size)
    if (plan.total <= capacity())
      return { size, sections: plan.sections, headingHeight: plan.headingHeight, fitsOnePage: true }
  }
  const smallest = AUTO_FIT_SIZES[AUTO_FIT_SIZES.length - 1]
  const plan = planAt(smallest)
  return { size: smallest, sections: plan.sections, headingHeight: plan.headingHeight, fitsOnePage: false }
}
