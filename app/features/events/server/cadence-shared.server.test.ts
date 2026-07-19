import { describe, expect, it } from 'vitest'
import { EMPTY_CADENCE, normalize, toCadenceStatus } from './cadence-shared.server'

describe('normalize', () => {
  it('lowercases input so case differences do not split a slot', () => {
    expect(normalize('Bible Reading')).toBe(normalize('bible reading'))
  })

  it('strips diacritics so accented spellings still match their base form', () => {
    expect(normalize('Ministère')).toBe(normalize('ministere'))
  })

  it('trims surrounding whitespace', () => {
    expect(normalize('  Bible Reading  ')).toBe(normalize('Bible Reading'))
  })

  it('returns the empty string for an empty input', () => {
    expect(normalize('')).toBe('')
  })

  it('preserves internal whitespace', () => {
    expect(normalize('First   part')).toBe('first   part')
  })
})

describe('EMPTY_CADENCE', () => {
  it('is anchored=false so cards hide the whole panel when no anchor was resolved', () => {
    expect(EMPTY_CADENCE.anchored).toBe(false)
  })

  it('exposes the full payload shape with default values', () => {
    expect(EMPTY_CADENCE).toEqual({
      anchored: false,
      past: [],
      future: [],
      hasHistory: false,
      savedMatchesSelection: false,
    })
  })
})

describe('toCadenceStatus', () => {
  it("returns 'draft' when the row status is exactly the literal 'draft'", () => {
    expect(toCadenceStatus('draft')).toBe('draft')
  })

  it("returns 'released' when the row status is the literal 'released'", () => {
    expect(toCadenceStatus('released')).toBe('released')
  })

  // Regression pin: Event.status is a free-form String column today. Anything
  // that isn't literally 'draft' must be bucketed as 'released' rather than
  // rendered as a distinct visual state — an unrecognised value ("cancelled",
  // "archived", …) still needs a stable classification so the strip does not
  // silently drop rows.
  it("returns 'released' as the fallback for an unknown status literal", () => {
    expect(toCadenceStatus('cancelled')).toBe('released')
    expect(toCadenceStatus('archived')).toBe('released')
    expect(toCadenceStatus('paused')).toBe('released')
  })

  it("returns 'released' for empty strings and non-string inputs (defensive coercion)", () => {
    expect(toCadenceStatus('')).toBe('released')
    expect(toCadenceStatus(null)).toBe('released')
    expect(toCadenceStatus(undefined)).toBe('released')
  })
})
