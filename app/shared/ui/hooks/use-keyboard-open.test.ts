import { describe, expect, it } from 'vitest'

import { keyboardCovers } from './use-keyboard-open'

describe('keyboardCovers', () => {
  it('is false when the whole window is visible', () => {
    expect(keyboardCovers(844, { height: 844, scale: 1 })).toBe(false)
  })

  it('is true when a keyboard hides the lower part of the window', () => {
    expect(keyboardCovers(844, { height: 508, scale: 1 })).toBe(true)
  })

  it('ignores a small difference such as a browser toolbar sliding in', () => {
    expect(keyboardCovers(844, { height: 790, scale: 1 })).toBe(false)
  })

  it('is false when the page is zoomed in, not covered', () => {
    expect(keyboardCovers(844, { height: 422, scale: 2 })).toBe(false)
  })
})
