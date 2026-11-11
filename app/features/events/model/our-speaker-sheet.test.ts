import { describe, expect, it } from 'vitest'
import { ADDRESS_ROOM, addressFit, addressHalves, OUR_LIST_TEXT_SIZE, ourListFilename } from './our-speaker-sheet'

const PLAIN_PDF_NAME = /^[\w .()-]+\.pdf$/

// Widths at 1pt, as the server's measurer gives them.
const fitsAt = (size: number) => ADDRESS_ROOM / size

describe('addressFit', () => {
  it('keeps the text size for an address that holds on its line', () => {
    expect(addressFit(fitsAt(OUR_LIST_TEXT_SIZE) * 0.98, 0)).toEqual({ size: OUR_LIST_TEXT_SIZE, split: false })
  })

  it('sets a long address smaller, by quarter points, so it still holds on one line', () => {
    const whole = fitsAt(OUR_LIST_TEXT_SIZE) * 1.2
    const fit = addressFit(whole, whole / 2)

    expect(fit.split).toBe(false)
    expect(fit.size).toBeLessThan(OUR_LIST_TEXT_SIZE)
    expect(fit.size * 4).toBe(Math.round(fit.size * 4))
    expect(fit.size * whole).toBeLessThanOrEqual(ADDRESS_ROOM)
  })

  it('puts an address too long even at the smallest size on two lines, after its « @ », each holding on its line', () => {
    const whole = fitsAt(7) * 1.5
    const longestHalf = fitsAt(OUR_LIST_TEXT_SIZE) * 1.1
    const fit = addressFit(whole, longestHalf)

    expect(fit.split).toBe(true)
    expect(fit.size * longestHalf).toBeLessThanOrEqual(ADDRESS_ROOM)
    expect(fit.size).toBeGreaterThanOrEqual(7)
  })
})

describe('addressHalves', () => {
  it('splits after the « @ », keeping it on the first line', () => {
    expect(addressHalves('gregoire.fontaine@exemple.fr')).toEqual(['gregoire.fontaine@', 'exemple.fr'])
  })

  it('keeps a value without « @ » whole', () => {
    expect(addressHalves('pas-une-adresse')).toEqual(['pas-une-adresse', ''])
  })
})

describe('ourListFilename', () => {
  it('names the PDF after the congregation and the day, in characters every mail client keeps', () => {
    const name = ourListFilename('Saint-Étienne « Nord »', '2026-11-11')

    expect(name).toMatch(PLAIN_PDF_NAME)
    expect(name).toContain('saint-etienne')
    expect(name).toContain('2026-11-11')
  })
})
