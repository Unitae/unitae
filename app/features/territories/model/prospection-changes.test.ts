import { describe, expect, it } from 'vitest'
import { countProspectionChanges } from './prospection-changes'

function form(entries: [string, string][]): FormData {
  const data = new FormData()
  for (const [name, value] of entries) data.append(name, value)
  return data
}

const residential: [string, string][] = [
  ['has-residential', 'on'],
  ['access', '4'],
  ['homes', '14'],
  ['phones', '6'],
  ['residential-notes', ''],
  ['shared-entrance-buildings', '3,5'],
]
const loaded = form([['prospection-date', '2026-10-03'], ...residential])

describe('countProspectionChanges', () => {
  it('finds nothing when the form is as loaded', () => {
    expect(countProspectionChanges(loaded, form([['prospection-date', '2026-10-03'], ...residential]))).toBe(0)
  })

  it('counts each changed field once', () => {
    const edited = form([
      ['prospection-date', '2026-11-08'],
      ...residential.map(([name, value]): [string, string] => [name, name === 'homes' ? '15' : value]),
    ])
    expect(countProspectionChanges(loaded, edited)).toBe(2)
  })

  it('counts a removed residential entrance once, whatever fields go with it', () => {
    expect(countProspectionChanges(loaded, form([['prospection-date', '2026-10-03']]))).toBe(1)
  })

  it('counts an added residential entrance once', () => {
    const before = form([['prospection-date', '']])
    const after = form([
      ['prospection-date', ''],
      ['has-residential', 'on'],
      ['homes', ''],
    ])
    expect(countProspectionChanges(before, after)).toBe(1)
  })

  it('counts switching to a digicode once, though its options appear with it', () => {
    const before = form([
      ['has-residential', 'on'],
      ['access', '1'],
    ])
    const after = form([
      ['has-residential', 'on'],
      ['access', '4'],
      ['mailboxes', 'on'],
    ])
    expect(countProspectionChanges(before, after)).toBe(1)
  })

  it('counts the digicode options when the digicode stays', () => {
    const before = form([
      ['has-residential', 'on'],
      ['access', '4'],
      ['mailboxes', 'on'],
    ])
    const after = form([
      ['has-residential', 'on'],
      ['access', '4'],
      ['doors', 'on'],
    ])
    expect(countProspectionChanges(before, after)).toBe(2)
  })

  it('reads the shared buildings as a set', () => {
    const reordered = form([
      ['prospection-date', '2026-10-03'],
      ...residential.map(([name, value]): [string, string] => [
        name,
        name === 'shared-entrance-buildings' ? '5,3' : value,
      ]),
    ])
    expect(countProspectionChanges(loaded, reordered)).toBe(0)
  })

  it('follows each shop by its key: added, removed, and every changed field of the kept ones', () => {
    const before = form([
      ['commerce-key', '10'],
      ['shopkinds', 'alimentaire'],
      ['commerce-notes', ''],
      ['commerce-key', '11'],
      ['shopkinds', 'autre'],
      ['commerce-notes', 'Fermé le lundi'],
    ])
    const after = form([
      ['commerce-key', '11'],
      ['shopkinds', 'maison'],
      ['commerce-notes', 'Ouvert le lundi'],
      ['commerce-key', 'entrance-3'],
      ['shopkinds', ''],
      ['commerce-notes', ''],
    ])
    expect(countProspectionChanges(before, after)).toBe(4)
  })

  it('counts a hotel, campus or laundromat added or removed once each', () => {
    expect(countProspectionChanges(form([['hotel', 'on']]), form([['landromat', 'on']]))).toBe(2)
  })
})
