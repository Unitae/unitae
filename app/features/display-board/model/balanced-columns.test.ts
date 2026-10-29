import { describe, expect, it } from 'vitest'
import { balancedColumns } from './balanced-columns'

const one = () => 1

describe('balancedColumns', () => {
  it('reads down the first column, then the next, filling the first ones on a tie', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

    expect(balancedColumns(names, 3, one)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
      ['f', 'g'],
    ])
  })

  it('balances by height, so a name on two lines counts twice', () => {
    const heights: Record<string, number> = { a: 2, b: 1, c: 1, d: 1, e: 1 }

    expect(balancedColumns(Object.keys(heights), 2, name => heights[name])).toEqual([
      ['a', 'b'],
      ['c', 'd', 'e'],
    ])
  })

  it('leaves the last columns empty when there are fewer items than columns', () => {
    expect(balancedColumns(['a', 'b'], 3, one)).toEqual([['a'], ['b'], []])
  })

  it('splits a long list without searching for ever', () => {
    const names = Array.from({ length: 150 }, (_, index) => index)

    const columns = balancedColumns(names, 3, one)

    expect(columns.map(column => column.length)).toEqual([50, 50, 50])
    expect(columns.flat()).toEqual(names)
  })
})
