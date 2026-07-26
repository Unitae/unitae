import { BILLING_TOKEN_TTL_MS, type BillingTokenPurpose, mintBillingLink } from '~/shared/auth/billing-token.server'
import logger from '~/shared/infra/logger.server'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { getHostSettings } from './host-settings.server'

// Builds the SaaS billing links (Stripe portal, resubscription) that point at the marketing site,
// signed with a token. Everything is config-driven: without a managed-hosting URL configured
// (HOST_SETTINGS.billing.*) or without `BILLING_LINK_SECRET`, we return `null` and the billing UI
// does not render. A self-hoster (even in multi-tenant mode) therefore gets no billing UI.

// "URL configured but secret missing" is a static, deployment-wide misconfiguration, yet `linkFor`
// runs on every settings-hub render (and the /suspended and /trial-expired shells). Log it once so
// the misconfig surfaces without flooding the log pipeline.
let missingSecretWarned = false

function tokenFor(slug: string, purpose: BillingTokenPurpose): string | null {
  const secret = getOptionalEnv('BILLING_LINK_SECRET')
  if (!secret) return null
  return mintBillingLink(slug, purpose, secret, { now: Date.now(), ttlMs: BILLING_TOKEN_TTL_MS })
}

function linkFor(baseUrl: string | undefined, slug: string, purpose: BillingTokenPurpose): string | null {
  // No URL configured = self-hosting: deliberate null, no billing UI.
  if (!baseUrl) return null
  const token = tokenFor(slug, purpose)
  if (!token) {
    // URL configured (managed deployment) but the token cannot be signed → BILLING_LINK_SECRET is
    // missing or desynced: the billing UI silently disappears. This is the only asymmetric case
    // worth signalling (a self-hoster has no URL, so never reaches this branch).
    if (!missingSecretWarned) {
      missingSecretWarned = true
      logger.error('Billing URL configured but BILLING_LINK_SECRET is missing — billing UI hidden', {
        tag: 'billing-link',
      })
    }
    return null
  }
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`
}

/** Link to the Stripe billing portal (active subscribers) — `null` when not configured. */
export function billingPortalLink(slug: string): string | null {
  return linkFor(getHostSettings().billing?.portalUrl, slug, 'billing')
}

/** Link to checkout/resubscription (expired trial, reactivation) — `null` when not configured. */
export function checkoutLink(slug: string): string | null {
  return linkFor(getHostSettings().billing?.upgradeUrl, slug, 'checkout')
}

/**
 * Destination for the settings-hub « Abonnement » card (`/settings`), routed by state so there is
 * always a path: a congregation that already has a Stripe customer manages it in the portal; one
 * without (trial / never subscribed) goes to checkout to START a subscription (which creates the
 * customer). Sending the latter to the portal would 410. `null` for non-admins or when self-hosted
 * (card not shown).
 */
export function billingEntryUrl(opts: {
  isAdmin: boolean
  stripeCustomerId: string | null
  slug: string
}): string | null {
  if (!opts.isAdmin) return null
  return opts.stripeCustomerId !== null ? billingPortalLink(opts.slug) : checkoutLink(opts.slug)
}
