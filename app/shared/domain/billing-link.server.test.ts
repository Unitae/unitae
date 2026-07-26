import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/utils/env.server', () => ({ getOptionalEnv: vi.fn() }))
vi.mock('./host-settings.server', () => ({ getHostSettings: vi.fn() }))
vi.mock('~/shared/infra/logger.server', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { verifyBillingToken } from '~/shared/auth/billing-token.server'
import logger from '~/shared/infra/logger.server'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { billingEntryUrl, billingPortalLink, checkoutLink } from './billing-link.server'
import { getHostSettings } from './host-settings.server'

const SECRET = 'test-secret'
const mockedEnv = vi.mocked(getOptionalEnv)
const mockedSettings = vi.mocked(getHostSettings)
const mockedLogger = vi.mocked(logger)

const MANAGED = {
  billing: { portalUrl: 'https://www.unitae.app/billing', upgradeUrl: 'https://www.unitae.app/checkout' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

function tokenOf(url: string): string {
  return new URL(url).searchParams.get('token') ?? ''
}

describe('config-driven billing links', () => {
  it('returns null with NO log when no billing URL is configured (self-hosted)', () => {
    mockedSettings.mockReturnValue({})
    mockedEnv.mockReturnValue(SECRET)
    expect(billingPortalLink('grace-community')).toBeNull()
    expect(checkoutLink('grace-community')).toBeNull()
    expect(mockedLogger.error).not.toHaveBeenCalled()
  })

  // NOTE: keep this the ONLY test that exercises the missing-secret branch. The once-per-process
  // guard lives in module state that survives between tests, so a second missing-secret test would
  // see the flag already tripped and observe zero logs.
  it('returns null and logs the managed misconfig ONCE, not per call', () => {
    mockedSettings.mockReturnValue(MANAGED)
    mockedEnv.mockReturnValue(undefined)

    expect(billingPortalLink('grace-community')).toBeNull()
    expect(checkoutLink('grace-community')).toBeNull()

    // Static, deployment-wide misconfig → surfaced once, not flooded on every admin render.
    expect(mockedLogger.error).toHaveBeenCalledTimes(1)
    // Operator-facing contract: the message names the missing var and carries the tag.
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('BILLING_LINK_SECRET'), {
      tag: 'billing-link',
    })
  })

  it('appends with & when the configured URL already carries a query string', () => {
    mockedSettings.mockReturnValue({
      billing: { portalUrl: 'https://www.unitae.app/billing?ref=app', upgradeUrl: 'https://www.unitae.app/checkout' },
    })
    mockedEnv.mockReturnValue(SECRET)

    const portal = billingPortalLink('grace-community')
    expect(portal?.startsWith('https://www.unitae.app/billing?ref=app&token=')).toBe(true)
    // The token stays a parseable query param instead of being swallowed into `ref`.
    const url = new URL(portal ?? '')
    expect(url.searchParams.get('ref')).toBe('app')
    expect(
      verifyBillingToken(url.searchParams.get('token') ?? '', SECRET, { purpose: 'billing', now: Date.now() }).valid,
    ).toBe(true)
  })

  it('couples portal→/billing→purpose:billing and checkout→/checkout→purpose:checkout', () => {
    mockedSettings.mockReturnValue(MANAGED)
    mockedEnv.mockReturnValue(SECRET)

    const portal = billingPortalLink('grace-community')
    expect(portal?.startsWith('https://www.unitae.app/billing?token=')).toBe(true)
    const portalToken = tokenOf(portal ?? '')
    expect(verifyBillingToken(portalToken, SECRET, { purpose: 'billing', now: Date.now() }).valid).toBe(true)
    expect(verifyBillingToken(portalToken, SECRET, { purpose: 'checkout', now: Date.now() }).valid).toBe(false)

    const checkout = checkoutLink('grace-community')
    expect(checkout?.startsWith('https://www.unitae.app/checkout?token=')).toBe(true)
    expect(verifyBillingToken(tokenOf(checkout ?? ''), SECRET, { purpose: 'checkout', now: Date.now() }).valid).toBe(
      true,
    )
  })
})

describe('billingEntryUrl (sidebar « Abonnement » routing by state)', () => {
  beforeEach(() => {
    mockedSettings.mockReturnValue(MANAGED)
    mockedEnv.mockReturnValue(SECRET)
  })

  it('returns null for a non-admin', () => {
    expect(billingEntryUrl({ isAdmin: false, stripeCustomerId: 'cus_1', slug: 'grace-community' })).toBeNull()
  })

  it('routes a congregation WITH a Stripe customer to the portal (manage)', () => {
    const url = billingEntryUrl({ isAdmin: true, stripeCustomerId: 'cus_1', slug: 'grace-community' })
    expect(url?.startsWith('https://www.unitae.app/billing?token=')).toBe(true)
  })

  it('routes a congregation WITHOUT a Stripe customer to checkout — so a trial can subscribe', () => {
    const url = billingEntryUrl({ isAdmin: true, stripeCustomerId: null, slug: 'grace-community' })
    expect(url?.startsWith('https://www.unitae.app/checkout?token=')).toBe(true)
  })

  it('returns null when self-hosted (no billing URLs), even for an admin, in either state', () => {
    mockedSettings.mockReturnValue({})
    expect(billingEntryUrl({ isAdmin: true, stripeCustomerId: null, slug: 'grace-community' })).toBeNull()
    expect(billingEntryUrl({ isAdmin: true, stripeCustomerId: 'cus_1', slug: 'grace-community' })).toBeNull()
  })
})
