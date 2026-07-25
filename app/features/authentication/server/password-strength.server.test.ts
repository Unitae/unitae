import { describe, expect, it } from 'vitest'

import { evaluatePasswordStrength, MIN_PASSWORD_SCORE } from './password-strength.server'

describe('evaluatePasswordStrength', () => {
  it('uses a minimum score of 2', () => {
    expect(MIN_PASSWORD_SCORE).toBe(2)
  })

  it('flags a top-breached password as weak', () => {
    const result = evaluatePasswordStrength('password')

    expect(result.weak).toBe(true)
    expect(result.score).toBeLessThan(MIN_PASSWORD_SCORE)
  })

  it('flags a predictable ≥8 password as weak', () => {
    // Passes the min(8) gate but is trivially guessable.
    expect(evaluatePasswordStrength('password123').weak).toBe(true)
    expect(evaluatePasswordStrength('qwertyuiop').weak).toBe(true)
  })

  it('flags a repetitive ≥8 password (clears length, trivial by composition)', () => {
    expect(evaluatePasswordStrength('aaaaaaaa').weak).toBe(true)
    expect(evaluatePasswordStrength('        ').weak).toBe(true)
  })

  it('handles an oversized password without hanging by bounding the estimator input', () => {
    const result = evaluatePasswordStrength('a'.repeat(100_000))

    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(4)
    expect(result.weak).toBe(true)
  })

  it('accepts a strong passphrase', () => {
    const result = evaluatePasswordStrength('correct-horse-battery-staple-4719')

    expect(result.weak).toBe(false)
    expect(result.score).toBeGreaterThanOrEqual(MIN_PASSWORD_SCORE)
  })

  it('returns a score within the zxcvbn 0..4 range and derives weak from it', () => {
    const { score, weak } = evaluatePasswordStrength('tr0ub4dour')

    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(4)
    expect(weak).toBe(score < MIN_PASSWORD_SCORE)
  })
})
