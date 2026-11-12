import { describe, expect, it } from 'vitest'

import { arrowStep, stepThrough } from './side-editor-walk'

describe('stepThrough', () => {
  const ids = [12, 7, 30]

  it('gives the next and the previous item in the list order', () => {
    expect(stepThrough(ids, 7, 1)).toBe(30)
    expect(stepThrough(ids, 7, -1)).toBe(12)
  })

  it('wraps around at both ends', () => {
    expect(stepThrough(ids, 30, 1)).toBe(12)
    expect(stepThrough(ids, 12, -1)).toBe(30)
  })

  it('has nowhere to go from an item that is not in the list', () => {
    expect(stepThrough(ids, 99, 1)).toBeNull()
  })

  it('has nowhere to go in a list of one', () => {
    expect(stepThrough([7], 7, 1)).toBeNull()
  })
})

describe('arrowStep', () => {
  it('steps back on ↑ and forward on ↓', () => {
    expect(arrowStep('ArrowUp', false)).toBe(-1)
    expect(arrowStep('ArrowDown', false)).toBe(1)
  })

  it('leaves the arrows to a field, where they already mean something', () => {
    expect(arrowStep('ArrowDown', true)).toBeNull()
  })

  it('ignores every other key', () => {
    expect(arrowStep('ArrowLeft', false)).toBeNull()
    expect(arrowStep('j', false)).toBeNull()
  })
})
