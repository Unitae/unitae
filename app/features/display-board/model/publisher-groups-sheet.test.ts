import { describe, expect, it } from 'vitest'
import type { BoardPerson } from './board-roster'
import {
  fitGroupsSheet,
  groupSheetName,
  leadersOf,
  membersOf,
  type SheetPublisherGroup,
} from './publisher-groups-sheet'
import type { TextMeasurer } from './sheet-text'

// Roughly Fira Sans: half a point per character at 1pt, a little more in bold.
const measurer: TextMeasurer = {
  width: (text, weight) => text.length * (weight === 'bold' ? 0.58 : 0.5),
  baseline: 0.935,
}

let nextId = 1
function person(lastname = `Martin${nextId}`): BoardPerson {
  return { id: nextId++, firstname: 'Jean', lastname, anonymizedAt: null }
}

function group(size: number, name = 'Groupe Centre'): SheetPublisherGroup {
  const responsible = person()
  const deputy = person()
  return {
    id: nextId++,
    name,
    adress: '15 avenue Victor Hugo, 75017',
    responsible,
    deputy,
    members: Array.from({ length: size - 2 }, () => person()),
  }
}

const groups = (sizes: number[]) => sizes.map(size => group(size))

describe('the groups sheet', () => {
  it('prints the leaders in the head and everyone else in the list', () => {
    const centre = group(5)

    expect(leadersOf(centre).map(({ person }) => person.id)).toEqual([centre.responsible.id, centre.deputy?.id])
    expect(membersOf(centre)).toHaveLength(3)
    expect(membersOf(centre)).not.toContainEqual(centre.responsible)
  })

  it('prints a group’s name in capitals, as the rest of the app does', () => {
    expect(groupSheetName(group(3, 'Groupe Ouest — Clichy-Levallois'))).toBe('GROUPE OUEST — CLICHY-LEVALLOIS')
  })

  it.each(['directory', 'columns', 'bands'] as const)('sets a few small groups in the largest size, %s', layout => {
    const plan = fitGroupsSheet(layout, groups([8, 9, 7]), measurer)

    expect(plan.size).toBe(12)
    expect(plan.pages).toBe(1)
    expect(plan.fallback).toBe(false)
  })

  it.each(['directory', 'columns', 'bands'] as const)('keeps six groups of 25 on one page, %s', layout => {
    const plan = fitGroupsSheet(layout, groups([25, 25, 25, 25, 25, 25]), measurer)

    expect(plan.pages).toBe(1)
    expect(plan.size).toBeLessThan(12)
    expect(plan.size).toBeGreaterThanOrEqual(9)
  })

  it('sets up to six groups side by side in columns, and more in even rows', () => {
    expect(fitGroupsSheet('columns', groups([10, 10, 10, 10, 10, 10]), measurer).geometry.perRow).toBe(6)
    expect(fitGroupsSheet('columns', groups([10, 10, 10, 10, 10, 10, 10, 10]), measurer).geometry.perRow).toBe(4)
  })

  it('lets a group taller than a page flow over the next pages instead of losing names', () => {
    const plan = fitGroupsSheet('columns', groups([12, 90]), measurer)

    expect(plan.sheets.flat().some(row => row.oversized)).toBe(true)
    expect(plan.pages).toBeGreaterThan(1)
    expect(plan.sheets.flat().flatMap(row => row.columns.flat())).toHaveLength(2)
  })

  it('keeps every group exactly once across the sheets', () => {
    const many = groups([20, 25, 18, 22, 30, 15, 24, 19, 21])

    for (const layout of ['directory', 'columns', 'bands'] as const) {
      const placed = fitGroupsSheet(layout, many, measurer).sheets.flatMap(sheet =>
        sheet.flatMap(row => row.columns.flat()),
      )
      expect(placed.map(placedGroup => placedGroup.id)).toEqual(many.map(each => each.id))
    }
  })

  it('reports a name too wide for its column even at 9pt instead of hiding it', () => {
    const wide = group(4)
    wide.members[0] = person('Wolfeschlegelsteinhausenbergerdorffvoralternwarengewissenhaft')

    const plan = fitGroupsSheet('columns', [wide, ...groups([4, 4, 4, 4, 4])], measurer)

    expect(plan.fallback).toBe(true)
    expect(plan.size).toBe(9)
  })

  it('splits each group’s list into balanced columns, reading down each in turn', () => {
    const centre = group(23)
    const plan = fitGroupsSheet('bands', [centre], measurer)

    const columns = plan.nameColumns(centre)
    expect(columns.map(column => column.length)).toEqual([7, 7, 7])
    expect(columns.flat()).toEqual(membersOf(centre))
  })
})
