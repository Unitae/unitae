import { BILLING_TOKEN_TTL_MS, type BillingTokenPurpose, mintBillingLink } from '~/shared/auth/billing-token.server'
import logger from '~/shared/infra/logger.server'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { getHostSettings } from './host-settings.server'

// Construit les liens de facturation SaaS (portail Stripe, réabonnement) pointant vers le site
// marketing, signés par un jeton. TOUT est config-driven : sans URL d'hébergement géré configurée
// (HOST_SETTINGS.billing.*) ou sans `BILLING_LINK_SECRET`, on renvoie `null` et l'UI de facturation
// ne s'affiche pas. Un self-hébergeur (même en multi-tenant) n'a donc aucune UI de facturation.

function tokenFor(slug: string, purpose: BillingTokenPurpose): string | null {
  const secret = getOptionalEnv('BILLING_LINK_SECRET')
  if (!secret) return null
  return mintBillingLink(slug, purpose, secret, { now: Date.now(), ttlMs: BILLING_TOKEN_TTL_MS })
}

function linkFor(baseUrl: string | undefined, slug: string, purpose: BillingTokenPurpose): string | null {
  // Pas d'URL configurée = auto-hébergement : null volontaire, aucune UI de facturation.
  if (!baseUrl) return null
  const token = tokenFor(slug, purpose)
  if (!token) {
    // URL configurée (déploiement géré) mais jeton non signable → BILLING_LINK_SECRET manquant ou
    // désynchronisé : l'UI de facturation disparaît en silence. C'est le seul cas asymétrique à
    // signaler (un self-hébergeur n'a pas d'URL, donc n'atteint jamais cette branche).
    logger.error('Lien de facturation configuré mais BILLING_LINK_SECRET absent — UI de facturation masquée', {
      tag: 'billing-link',
    })
    return null
  }
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`
}

/** Lien vers le portail de facturation Stripe (abonnés actifs) — `null` si non configuré. */
export function billingPortalLink(slug: string): string | null {
  return linkFor(getHostSettings().billing?.portalUrl, slug, 'billing')
}

/** Lien vers le paiement/réabonnement (essai expiré, réactivation) — `null` si non configuré. */
export function checkoutLink(slug: string): string | null {
  return linkFor(getHostSettings().billing?.upgradeUrl, slug, 'checkout')
}
