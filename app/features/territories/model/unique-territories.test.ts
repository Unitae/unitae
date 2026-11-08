import { describe, expect, it } from 'vitest'
import { uniqueTerritories } from './unique-territories'

const t = (id: number, number: string) => ({ id, number })

describe('uniqueTerritories', () => {
  it('lists each territory once across the entrances', () => {
    const entrances = [{ territories: [t(5, 'T05')] }, { territories: [t(5, 'T05'), t(6, 'T06')] }]
    expect(uniqueTerritories(entrances)).toEqual([t(5, 'T05'), t(6, 'T06')])
  })

  it('sorts them by number, 2 before 10', () => {
    const entrances = [{ territories: [t(1, '10'), t(2, '2'), t(3, '1')] }]
    expect(uniqueTerritories(entrances).map(({ number }) => number)).toEqual(['1', '2', '10'])
  })

  it('finds none without entrances or territories', () => {
    expect(uniqueTerritories([])).toEqual([])
    expect(uniqueTerritories([{ territories: [] }])).toEqual([])
  })
})
