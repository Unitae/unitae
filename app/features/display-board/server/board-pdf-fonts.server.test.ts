import { describe, expect, it } from 'vitest'
import { loadBoardPdfTypeface } from './board-pdf-fonts.server'

describe('loadBoardPdfTypeface', () => {
  it('measures text in the typeface the sheet is set in', async () => {
    const fira = await loadBoardPdfTypeface('fira')
    const serif = await loadBoardPdfTypeface('serif')

    expect(fira.width('Groupes de prédication', 'regular')).toBeGreaterThan(5)
    expect(fira.width('DUPONT', 'bold')).toBeGreaterThan(fira.width('DUPONT', 'regular'))
    expect(serif.width('Groupes de prédication', 'regular')).not.toBeCloseTo(
      fira.width('Groupes de prédication', 'regular'),
    )
  })

  it('measures a character Atkinson Hyperlegible lacks in Fira Sans, the family it falls back to', async () => {
    const fira = await loadBoardPdfTypeface('fira')
    const atkinson = await loadBoardPdfTypeface('atkinson')

    // « ễ » (Vietnamese) is not in Atkinson Hyperlegible 1.006.
    expect(atkinson.width('ễ', 'regular')).toBeCloseTo(fira.width('ễ', 'regular'))
    expect(atkinson.width('Nguyễn', 'regular')).toBeCloseTo(
      atkinson.width('Nguy', 'regular') + fira.width('ễ', 'regular') + atkinson.width('n', 'regular'),
    )
  })

  it('places the baseline from the typeface’s own ascent', async () => {
    const serif = await loadBoardPdfTypeface('serif')

    expect(serif.baseline).toBeCloseTo(1.036)
  })

  it('loads each typeface once per process', () => {
    expect(loadBoardPdfTypeface('fira')).toBe(loadBoardPdfTypeface('fira'))
  })
})
