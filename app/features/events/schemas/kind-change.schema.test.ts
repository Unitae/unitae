import { describe, expect, it } from 'vitest'
import { kindChangeFrom } from './kind-change.schema'

const form = (entries: [string, string][]) => {
  const data = new FormData()
  for (const [key, value] of entries) data.append(key, value)
  return data
}

describe('kindChangeFrom', () => {
  it('reads the kind and every ticked box, none ticked included', () => {
    expect(
      kindChangeFrom(
        form([
          ['kindId', '4'],
          ['keep', '10'],
          ['remove', '11'],
          ['add', '7'],
        ]),
      ).data,
    ).toEqual({
      kindId: 4,
      keep: [10],
      remove: [11],
      add: [7],
    })
    expect(kindChangeFrom(form([['kindId', '4']])).data).toEqual({ kindId: 4, keep: [], remove: [], add: [] })
  })

  it('refuses a missing kind or an id that is not one', () => {
    expect(kindChangeFrom(form([['keep', '10']])).success).toBe(false)
    expect(
      kindChangeFrom(
        form([
          ['kindId', '4'],
          ['add', 'x'],
        ]),
      ).success,
    ).toBe(false)
  })
})
