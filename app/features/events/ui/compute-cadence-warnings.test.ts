import { describe, expect, it } from 'vitest'
import { computeCadenceWarnings } from './compute-cadence-warnings'

// Convenience: build a cadence entry. Only `assigned` matters for these tests.
const entry = (assigned: boolean) => ({ date: '2026-01-01', assigned, personName: null })

describe('computeCadenceWarnings', () => {
  describe('firstTime', () => {
    it('is true when every past and future dot is empty and hasHistory is false', () => {
      const result = computeCadenceWarnings({
        past: [entry(false), entry(false), entry(false)],
        future: [entry(false)],
        hasHistory: false,
      })
      expect(result.firstTime).toBe(true)
    })

    it('is true when both arrays are empty (no data at all)', () => {
      expect(computeCadenceWarnings({ past: [], future: [] }).firstTime).toBe(true)
    })

    it('is false as soon as one past dot is filled', () => {
      const result = computeCadenceWarnings({
        past: [entry(false), entry(true), entry(false)],
        future: [],
      })
      expect(result.firstTime).toBe(false)
    })

    it('is false as soon as one future dot is filled', () => {
      const result = computeCadenceWarnings({
        past: [entry(false)],
        future: [entry(true)],
      })
      expect(result.firstTime).toBe(false)
    })

    it('is false when the visible window is empty but hasHistory is true (that is overdue, not first-time)', () => {
      const result = computeCadenceWarnings({
        past: [entry(false), entry(false)],
        future: [entry(false)],
        hasHistory: true,
      })
      expect(result.firstTime).toBe(false)
    })
  })

  describe('overdue', () => {
    it('fires when the visible window has no assigned dot AND hasHistory is true', () => {
      const result = computeCadenceWarnings({
        past: [entry(false), entry(false)],
        future: [entry(false)],
        hasHistory: true,
      })
      expect(result.overdue).toBe(true)
    })

    it('does not fire when the person has any assigned dot in the visible window', () => {
      const result = computeCadenceWarnings({
        past: [entry(false), entry(true)],
        future: [],
        hasHistory: true,
      })
      expect(result.overdue).toBe(false)
    })

    it('does not fire when hasHistory is false (that is first-time, not overdue)', () => {
      const result = computeCadenceWarnings({
        past: [entry(false)],
        future: [entry(false)],
        hasHistory: false,
      })
      expect(result.overdue).toBe(false)
    })

    it('is false when hasHistory defaults to unspecified (backwards compat)', () => {
      const result = computeCadenceWarnings({ past: [], future: [] })
      expect(result.overdue).toBe(false)
    })
  })

  describe('consecutive', () => {
    it('fires when the most recent past dot is this person', () => {
      const result = computeCadenceWarnings({
        past: [entry(false), entry(false), entry(true)],
        future: [entry(false)],
      })
      expect(result.consecutive).toBe(true)
    })

    it('fires when the very next future dot is this person', () => {
      const result = computeCadenceWarnings({
        past: [entry(false)],
        future: [entry(true), entry(false)],
      })
      expect(result.consecutive).toBe(true)
    })

    it('does not fire when the nearest dots on both sides belong to someone else', () => {
      const result = computeCadenceWarnings({
        past: [entry(true), entry(false)],
        future: [entry(false), entry(true)],
      })
      expect(result.consecutive).toBe(false)
    })

    it('does not fire when past is empty and no future assignment', () => {
      const result = computeCadenceWarnings({
        past: [],
        future: [entry(false)],
      })
      expect(result.consecutive).toBe(false)
    })
  })

  describe('rotationConcern', () => {
    it('fires when 2 of the last 3 past dots are this person', () => {
      const result = computeCadenceWarnings({
        past: [entry(false), entry(false), entry(false), entry(true), entry(false), entry(true)],
        future: [],
      })
      expect(result.rotationConcern).toEqual({ assigned: 2, window: 3 })
    })

    it('fires when 3 of the last 3 past dots are this person', () => {
      const result = computeCadenceWarnings({
        past: [entry(false), entry(true), entry(true), entry(true)],
        future: [],
      })
      expect(result.rotationConcern).toEqual({ assigned: 3, window: 3 })
    })

    it('does not fire when only 1 of the last 3 past dots is this person', () => {
      const result = computeCadenceWarnings({
        past: [entry(true), entry(false), entry(false), entry(true)],
        future: [],
      })
      expect(result.rotationConcern).toBeNull()
    })

    it('does not fire when past has fewer than 3 entries', () => {
      const result = computeCadenceWarnings({
        past: [entry(true), entry(true)],
        future: [],
      })
      expect(result.rotationConcern).toBeNull()
    })

    it('is agnostic to future dots — only past drives rotation', () => {
      const result = computeCadenceWarnings({
        past: [entry(false), entry(false), entry(false)],
        future: [entry(true), entry(true), entry(true)],
      })
      expect(result.rotationConcern).toBeNull()
    })
  })
})
