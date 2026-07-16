import { describe, expect, it } from 'vitest'
import { joinMessages } from './join-messages'

describe('joinMessages', () => {
  it('returns null when no parts are provided', () => {
    expect(joinMessages([])).toBeNull()
  })

  it('returns null when every part is empty / null / undefined / false', () => {
    expect(joinMessages([null, undefined, false, ''])).toBeNull()
  })

  it('returns the single string when only one truthy part is given', () => {
    expect(joinMessages([null, 'only one', false])).toBe('only one')
  })

  it('joins multiple truthy parts with newlines by default', () => {
    expect(joinMessages(['a', 'b', 'c'])).toBe('a\nb\nc')
  })

  it('drops falsy entries and preserves the order of the truthy ones', () => {
    expect(joinMessages(['first', null, false, 'second', undefined, 'third'])).toBe('first\nsecond\nthird')
  })

  it('accepts a custom separator', () => {
    expect(joinMessages(['a', 'b'], ' · ')).toBe('a · b')
  })
})
