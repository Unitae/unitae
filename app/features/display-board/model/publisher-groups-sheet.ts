import { balancedColumns } from '~/features/display-board/model/balanced-columns'
import type { BoardLayout } from '~/features/display-board/model/board-appearance'
import { type BoardPerson, boardPersonNameRuns, buildGroupRoster } from '~/features/display-board/model/board-roster'
import type { DynamicType } from '~/features/display-board/model/dynamic-document.type'
import {
  AUTO_FIT_SIZES,
  ENTRY_RULE_HEIGHT,
  mastheadHeight,
  SAFE_FILL,
  sheetContentBox,
} from '~/features/display-board/model/sheet-page'
import { lineCount, type TextMeasurer, type TextRun, widestWord } from '~/features/display-board/model/sheet-text'
import * as m from '~/i18n/paraglide/messages'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// How the printable « Groupes de prédication » lays itself out, before react-pdf draws it:
//   directory  the groups run down the left column then the right one, names in two columns;
//   columns    one column per group side by side, on a landscape sheet;
//   bands      one band per group across the page: its name and leaders on the left, everyone
//              else in three columns.
// The responsable and the adjoint sit in the group's head in every layout, never in its list.
// The text takes the largest size, from 12pt down to 9pt, that keeps the sheet on the fewest
// pages with every word inside its column. A group never breaks across pages — unless it is
// taller than a page on its own, and then it flows on rather than lose the names that don't fit.

export type GroupsLayout = BoardLayout<typeof DynamicType.PublisherGroups>

export interface SheetPublisherGroup {
  id: number
  name: string
  adress: string
  responsible: BoardPerson
  deputy: BoardPerson | null
  members: BoardPerson[]
}

export const GROUPS_LINE_HEIGHT = 1.2
/** The space under each group, × the size over 10. */
export const GROUP_GAP = 9

export function leadersOf(group: SheetPublisherGroup): { label: string; person: BoardPerson }[] {
  return [
    { label: m.board_dynamic_publisher_groups_responsible_label(), person: group.responsible },
    ...(group.deputy ? [{ label: m.board_dynamic_publisher_groups_deputy_label(), person: group.deputy }] : []),
  ]
}

/** Everyone in the group but its leaders, who are printed in its head. */
export function membersOf(group: SheetPublisherGroup): BoardPerson[] {
  const leaderIds = new Set(leadersOf(group).map(({ person }) => person.id))
  return buildGroupRoster(group).filter(person => !leaderIds.has(person.id))
}

/** The group's name exactly as printed — in capitals, as everywhere else in the app. */
export function groupSheetName(group: SheetPublisherGroup): string {
  return sanitizeText(formatGroupName(group.name))
}

export function groupCountLabel(group: SheetPublisherGroup): string {
  const label = m.board_dynamic_publisher_groups_members_label().toLocaleLowerCase('fr')
  return `${buildGroupRoster(group).length} ${label}`
}

/** Up to six groups side by side; more fill as many even rows as needed. */
function perRowFor(count: number): number {
  return Math.max(1, Math.ceil(count / Math.ceil(count / 6)))
}

// ── Geometry ───────────────────────────────────────────────────────────
// Shared by the estimate and the drawing, so the two can't drift apart.

export function groupsGeometry(layout: GroupsLayout, measurer: TextMeasurer, s: number, groupCount: number) {
  const k = s / 10
  const line = s * GROUPS_LINE_HEIGHT
  if (layout === 'directory') {
    const page = sheetContentBox('portrait')
    const column = (page.width - 18) / 2
    const labels = leadersLabels().map(label => measurer.width(label, 'regular') * s)
    const role = Math.max(...labels) + 6
    return {
      layout,
      orientation: 'portrait' as const,
      page,
      k,
      line,
      gap: 18,
      perRow: 2,
      index: 0,
      head: { size: 1.4 * s, width: column * 0.74, address: column },
      role,
      leaderName: column - role,
      nameColumns: 2,
      nameGap: 8,
      nameColumn: (column - 8) / 2,
    }
  }
  if (layout === 'columns') {
    const page = sheetContentBox('landscape')
    const perRow = perRowFor(groupCount)
    const column = (page.width - 14 * (perRow - 1)) / perRow
    return {
      layout,
      orientation: 'landscape' as const,
      page,
      k,
      line,
      gap: 14,
      perRow,
      index: 0,
      head: { size: 1.25 * s, width: column, address: column },
      role: 0,
      leaderName: column,
      nameColumns: 1,
      nameGap: 0,
      nameColumn: column,
    }
  }
  const page = sheetContentBox('portrait')
  const index = 130
  const names = page.width - index - 14
  return {
    layout,
    orientation: 'portrait' as const,
    page,
    k,
    line,
    gap: 14,
    perRow: 1,
    index,
    head: { size: 1.25 * s, width: index, address: index },
    role: 0,
    leaderName: index,
    nameColumns: 3,
    nameGap: 10,
    nameColumn: (names - 2 * 10) / 3,
  }
}

export type GroupsGeometry = ReturnType<typeof groupsGeometry>

function leadersLabels(): string[] {
  return [m.board_dynamic_publisher_groups_responsible_label(), m.board_dynamic_publisher_groups_deputy_label()]
}

// ── Estimating ─────────────────────────────────────────────────────────

/** What the estimate needs at one size, with the column splits it has already worked out. */
interface Fit {
  measurer: TextMeasurer
  s: number
  geometry: GroupsGeometry
  columns: Map<number, BoardPerson[][]>
}

function height(fit: Fit, runs: TextRun[], size: number, width: number): number {
  return lineCount(runs, fit.measurer, size, width) * size * GROUPS_LINE_HEIGHT
}

function nameHeight(fit: Fit, person: BoardPerson): number {
  return height(fit, boardPersonNameRuns(person), fit.s, fit.geometry.nameColumn)
}

function nameColumnsOf(fit: Fit, group: SheetPublisherGroup): BoardPerson[][] {
  let columns = fit.columns.get(group.id)
  if (!columns) {
    columns = balancedColumns(membersOf(group), fit.geometry.nameColumns, person => nameHeight(fit, person))
    fit.columns.set(group.id, columns)
  }
  return columns
}

/** Everything above the list of names: the group's name, head count, address and leaders. */
function headHeight(fit: Fit, group: SheetPublisherGroup): number {
  const { k, line, head, role, leaderName, layout } = fit.geometry
  const name = height(fit, [{ text: groupSheetName(group), weight: 'bold' }], head.size, head.width)
  const address = height(fit, [{ text: sanitizeText(group.adress), weight: 'regular' }], fit.s, head.address)
  const leaders = leadersOf(group).reduce(
    (total, { person }) => total + (role ? 0 : line) + height(fit, boardPersonNameRuns(person), fit.s, leaderName),
    0,
  )
  // Bands set their head beside the names, the leaders under a little space rather than a rule.
  if (layout === 'bands') return name + line + address + 5 * k + leaders
  // Directory sets the head count beside the name; columns stack it under.
  const count = layout === 'columns' ? line : 0
  return name + count + address + 11 * k + 0.75 + leaders
}

function namesHeight(fit: Fit, group: SheetPublisherGroup): number {
  return Math.max(
    0,
    ...nameColumnsOf(fit, group).map(column => column.reduce((total, person) => total + nameHeight(fit, person), 0)),
  )
}

function groupHeight(fit: Fit, group: SheetPublisherGroup): number {
  const head = headHeight(fit, group)
  const names = namesHeight(fit, group)
  return fit.geometry.layout === 'bands' ? Math.max(head, names) : head + names
}

/** The height a row's heads take: in columns, every list starts under the row's tallest head. */
function rowHeadHeight(fit: Fit, row: SheetPublisherGroup[]): number {
  return Math.max(0, ...row.map(group => headHeight(fit, group)))
}

/** A row on the page, its rule and the gap under it included. */
function rowHeight(fit: Fit, row: SheetPublisherGroup[]): number {
  const content =
    fit.geometry.layout === 'columns'
      ? rowHeadHeight(fit, row) + Math.max(0, ...row.map(group => namesHeight(fit, group)))
      : Math.max(0, ...row.map(group => groupHeight(fit, group)))
  return ENTRY_RULE_HEIGHT + content + GROUP_GAP * fit.geometry.k
}

/** Every word of every name, group name and address has to fit where it is printed. */
function everyWordFits(fit: Fit, groups: SheetPublisherGroup[]): boolean {
  const { head, leaderName, nameColumn } = fit.geometry
  const fits = (runs: TextRun[], size: number, width: number) => widestWord(runs, fit.measurer, size) <= width
  return groups.every(
    group =>
      fits([{ text: groupSheetName(group), weight: 'bold' }], head.size, head.width) &&
      fits([{ text: sanitizeText(group.adress), weight: 'regular' }], fit.s, head.address) &&
      leadersOf(group).every(({ person }) => fits(boardPersonNameRuns(person), fit.s, leaderName)) &&
      membersOf(group).every(person => fits(boardPersonNameRuns(person), fit.s, nameColumn)),
  )
}

// ── Planning the sheets ────────────────────────────────────────────────

/**
 * A row across the page. Directory has one per sheet, its two columns of groups; columns has up to
 * six groups side by side; bands has one group. An oversized row is taller than a page on its own:
 * it opens a page and flows over the next ones instead of being kept whole.
 */
export interface GroupsRow {
  columns: SheetPublisherGroup[][]
  oversized: boolean
  /** Columns layout: the height of the row's tallest head, so every list starts on one line. */
  headHeight: number
}

export interface GroupsSheetPlan {
  size: number
  geometry: GroupsGeometry
  sheets: GroupsRow[][]
  /** The pages the sheets take, oversized rows counted for every page they flow over. */
  pages: number
  /** Some word is wider than its column even at 9pt; it will run over. */
  fallback: boolean
  nameColumns(group: SheetPublisherGroup): BoardPerson[][]
}

function capacity(fit: Fit, sheet: number): number {
  return (fit.geometry.page.height - (sheet === 0 ? mastheadHeight() : 0)) * SAFE_FILL
}

/** The split that makes the two columns as even as possible, keeping the board order. */
function splitInTwo(fit: Fit, groups: SheetPublisherGroup[]): { columns: SheetPublisherGroup[][]; tallest: number } {
  const columns = balancedColumns(
    groups,
    2,
    group => ENTRY_RULE_HEIGHT + groupHeight(fit, group) + GROUP_GAP * fit.geometry.k,
  )
  // The first group of a column has no rule above it.
  const stack = (column: SheetPublisherGroup[]) =>
    column.reduce(
      (total, group) => total + ENTRY_RULE_HEIGHT + groupHeight(fit, group) + GROUP_GAP * fit.geometry.k,
      0,
    ) - (column.length > 0 ? ENTRY_RULE_HEIGHT : 0)
  return { columns, tallest: Math.max(...columns.map(stack)) }
}

function planDirectory(fit: Fit, groups: SheetPublisherGroup[]): { sheets: GroupsRow[][]; pages: number } {
  const sheets: GroupsRow[][] = []
  let pages = 0
  let rest = groups
  while (rest.length > 0) {
    const room = capacity(fit, sheets.length)
    let count = rest.length
    while (count > 1 && splitInTwo(fit, rest.slice(0, count)).tallest > room) count--
    const { columns, tallest } = splitInTwo(fit, rest.slice(0, count))
    // A lone group taller than a column flows down it over as many pages as it needs.
    const oversized = tallest > room
    sheets.push([{ columns, oversized, headHeight: 0 }])
    pages += oversized ? Math.ceil(tallest / capacity(fit, 1)) : 1
    rest = rest.slice(count)
  }
  return { sheets, pages }
}

function planRows(fit: Fit, groups: SheetPublisherGroup[]): { sheets: GroupsRow[][]; pages: number } {
  const sheets: GroupsRow[][] = []
  let current: GroupsRow[] = []
  let used = 0
  let pages = 0
  const close = () => {
    if (current.length === 0) return
    sheets.push(current)
    pages += 1
    current = []
    used = 0
  }
  const { perRow } = fit.geometry
  for (let index = 0; index < groups.length; index += perRow) {
    const groupsInRow = groups.slice(index, index + perRow)
    const row: GroupsRow = {
      columns: groupsInRow.map(group => [group]),
      oversized: false,
      headHeight: rowHeadHeight(fit, groupsInRow),
    }
    const rowTall = rowHeight(fit, groupsInRow)
    const opensSheet = sheets.length === 0 && current.length === 0
    // Taller than a page, or than the room under the masthead when it comes first: it flows over
    // as many pages as it needs rather than lose the names that don't fit, or leave a blank page.
    if (rowTall > capacity(fit, opensSheet ? 0 : 1)) {
      close()
      sheets.push([{ ...row, oversized: true }])
      const before = sheets.length === 1 ? mastheadHeight() : 0
      pages += Math.ceil((before + rowTall) / capacity(fit, 1))
      continue
    }
    if (current.length > 0 && used + rowTall > capacity(fit, sheets.length)) close()
    current.push(row)
    used += rowTall
  }
  close()
  return { sheets, pages }
}

function plan(
  layout: GroupsLayout,
  groups: SheetPublisherGroup[],
  measurer: TextMeasurer,
  size: number,
  strict: boolean,
) {
  const geometry = groupsGeometry(layout, measurer, size, groups.length)
  const fit: Fit = { measurer, s: size, geometry, columns: new Map() }
  if (strict && !everyWordFits(fit, groups)) return null
  const { sheets, pages } = layout === 'directory' ? planDirectory(fit, groups) : planRows(fit, groups)
  return { size, geometry, sheets, pages, nameColumns: (group: SheetPublisherGroup) => nameColumnsOf(fit, group) }
}

/** The largest size that needs no more pages than the smallest size does, every word inside its column. */
export function fitGroupsSheet(
  layout: GroupsLayout,
  groups: SheetPublisherGroup[],
  measurer: TextMeasurer,
): GroupsSheetPlan {
  const smallest = AUTO_FIT_SIZES[AUTO_FIT_SIZES.length - 1]
  const fewest = plan(layout, groups, measurer, smallest, true)?.pages ?? Number.POSITIVE_INFINITY
  for (const size of AUTO_FIT_SIZES) {
    const candidate = plan(layout, groups, measurer, size, true)
    if (candidate && candidate.pages <= fewest) return { ...candidate, fallback: false }
  }
  // Some word is wider than its column even at the smallest size: it will run over. The render
  // gate fails on it; a curated layout must never get here with real names.
  const forced = plan(layout, groups, measurer, smallest, false)
  if (!forced) throw new Error('A groups sheet planned without the word check cannot be refused')
  return { ...forced, fallback: true }
}
