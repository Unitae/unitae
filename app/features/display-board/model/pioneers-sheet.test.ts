import { describe, expect, it } from 'vitest'
import { fitPioneersSheet, type SheetPioneer } from './pioneers-sheet'
import type { TextMeasurer } from './sheet-text'

const measurer: TextMeasurer = {
  width: (text, weight) => text.length * (weight === 'bold' ? 0.58 : 0.5),
  baseline: 0.935,
}

let nextId = 1
function pioneers(type: string, count: number): SheetPioneer[] {
  return Array.from({ length: count }, () => ({
    id: nextId,
    firstname: 'Marie',
    lastname: `Dupont${nextId++}`,
    anonymizedAt: null,
    type,
  }))
}

const usual = () => [
  ...pioneers('PionnierPermanant', 14),
  ...pioneers('PionnierSpecial', 1),
  ...pioneers('PionnierAuxiliaires', 26),
]

describe('the pioneers sheet', () => {
  it.each(['sections', 'columns'] as const)('fits a usual month on one page in the largest size it can, %s', layout => {
    const plan = fitPioneersSheet(layout, usual(), measurer)

    expect(plan.fitsOnePage).toBe(true)
    expect(plan.size).toBe(12)
    expect(plan.sections.map(section => section.type)).toEqual([
      'PionnierPermanant',
      'PionnierSpecial',
      'PionnierAuxiliaires',
    ])
  })

  it('gives a type too long for one column a second one, rather than run over the page', () => {
    const memorialMonth = [...pioneers('PionnierPermanant', 14), ...pioneers('PionnierAuxiliaires', 70)]

    const plan = fitPioneersSheet('columns', memorialMonth, measurer)

    expect(plan.fitsOnePage).toBe(true)
    const auxiliaries = plan.sections.find(section => section.type === 'PionnierAuxiliaires')
    expect(auxiliaries?.columns.length).toBeGreaterThan(1)
    expect(auxiliaries?.columns.flat()).toEqual(memorialMonth.slice(14))
  })

  it('reads each section down three balanced columns', () => {
    const plan = fitPioneersSheet('sections', pioneers('PionnierAuxiliaires', 7), measurer)

    expect(plan.sections[0].columns.map(column => column.length)).toEqual([3, 2, 2])
  })

  it('flows onto a second page rather than drop a name when nothing else holds', () => {
    const plan = fitPioneersSheet('sections', pioneers('PionnierAuxiliaires', 400), measurer)

    expect(plan.fitsOnePage).toBe(false)
    expect(plan.size).toBe(9)
    expect(plan.sections[0].columns.flat()).toHaveLength(400)
  })
})
