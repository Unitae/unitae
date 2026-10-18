import { describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/billing-link.server', () => ({
  billingEntryUrl: ({ isAdmin, slug }: { isAdmin: boolean; slug: string }) =>
    isAdmin ? `https://billing.example/checkout?for=${slug}` : null,
}))

const { getTrialBanner } = await import('./trial-banner.server')

const NOW = new Date('2026-10-18T10:00:00Z')

function congregation(trialEndsAt: Date | null) {
  return { trialEndsAt, timezone: 'Europe/Paris', stripeCustomerId: null, slug: 'lyon' }
}

describe('getTrialBanner', () => {
  it('shows nothing outside a trial', () => {
    expect(getTrialBanner(congregation(null), { canSubscribe: true, locale: 'fr', now: NOW })).toBeNull()
  })

  it('gives the days left and the last day in the congregation time zone', () => {
    // 23:30 UTC on 25 October (winter time from that day) is already 00:30 on the 26th in Paris.
    const banner = getTrialBanner(congregation(new Date('2026-10-25T23:30:00Z')), {
      canSubscribe: false,
      locale: 'fr',
      now: NOW,
    })

    expect(banner).toEqual({ daysLeft: 8, endingSoon: false, endsOn: '26 octobre', subscribeUrl: null })
  })

  it('offers the subscription link to members who can subscribe', () => {
    const banner = getTrialBanner(congregation(new Date('2026-10-20T10:00:00Z')), {
      canSubscribe: true,
      locale: 'fr',
      now: NOW,
    })

    expect(banner?.subscribeUrl).toBe('https://billing.example/checkout?for=lyon')
  })
})
