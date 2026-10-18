import { describe, expect, it } from 'vitest'

import { trialStatus } from './trial-status'

const NOW = new Date('2026-10-18T10:00:00Z')
const inHours = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000)

describe('trialStatus', () => {
  it('is null for a congregation that is not in trial', () => {
    expect(trialStatus(null, NOW)).toBeNull()
  })

  // Once the end has passed the session guard sends everyone to /trial-expired instead.
  it('is null once the trial has ended', () => {
    expect(trialStatus(NOW, NOW)).toBeNull()
    expect(trialStatus(inHours(-1), NOW)).toBeNull()
  })

  it('counts a started day as a day left', () => {
    expect(trialStatus(inHours(2), NOW)).toEqual({ daysLeft: 1, endingSoon: true })
    expect(trialStatus(inHours(24 * 3 + 1), NOW)).toEqual({ daysLeft: 4, endingSoon: true })
  })

  it('flags the last seven days as ending soon', () => {
    expect(trialStatus(inHours(24 * 7), NOW)).toEqual({ daysLeft: 7, endingSoon: true })
    expect(trialStatus(inHours(24 * 7 + 1), NOW)).toEqual({ daysLeft: 8, endingSoon: false })
  })
})
