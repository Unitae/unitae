import { describe, expect, it } from 'vitest'
import { getCampaignStatus } from './campaign-status'

describe('getCampaignStatus', () => {
  it('returns scheduled when the campaign has never been activated', () => {
    expect(getCampaignStatus({ activatedAt: null, endedAt: null })).toBe('scheduled')
  })

  it('returns active when activated and not yet ended', () => {
    expect(getCampaignStatus({ activatedAt: new Date('2026-01-15'), endedAt: null })).toBe('active')
  })

  it('returns ended once endedAt is set', () => {
    expect(getCampaignStatus({ activatedAt: new Date('2026-01-15'), endedAt: new Date('2026-03-01') })).toBe('ended')
  })

  it('returns ended even if activatedAt was never stamped (defensive)', () => {
    expect(getCampaignStatus({ activatedAt: null, endedAt: new Date('2026-03-01') })).toBe('ended')
  })
})
