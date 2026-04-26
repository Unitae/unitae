import { redirect } from 'react-router'

import { unscopedDb } from '~/shared/infra/db.server'

const DEFAULT_PLATFORM_NAME = 'Unitae'
const DEFAULT_EMAIL_FROM = process.env.EMAIL_FROM ?? 'Unitae <noreply@unitae.app>'

export type CongregationInfo = {
  id: number
  name: string
  slug: string
  locale: string
  displayName: string
  emailFrom: string
  baseUrl: string
  plan: string | null
  maxPublishers: number | null
  maxTerritories: number | null
  maxUsers: number | null
  maxStorageBytes: bigint | null
  maxBoardDocuments: number | null
  suspendedAt: Date | null
  suspendedReason: string | null
  trialEndsAt: Date | null
}

export async function resolveCongregation(congregationId: number): Promise<CongregationInfo> {
  const congregation = await unscopedDb.congregation.findUnique({
    where: { id: congregationId },
  })

  if (!congregation) {
    throw new Error(`Congregation ${congregationId} not found`)
  }

  const appBaseUrl = process.env.APP_BASE_URL ?? 'https://unitae.app'

  return {
    id: congregation.id,
    name: congregation.name,
    slug: congregation.slug,
    locale: congregation.locale ?? 'fr',
    displayName: congregation.displayName ?? congregation.name,
    emailFrom: congregation.emailFromAddress
      ? `${congregation.emailFromName ?? congregation.name} <${congregation.emailFromAddress}>`
      : DEFAULT_EMAIL_FROM,
    baseUrl: congregation.domain
      ? `https://${congregation.domain}`
      : (congregation.baseUrl ?? `https://${congregation.slug}.${appBaseUrl.replace('https://', '')}`),
    plan: congregation.plan,
    maxPublishers: congregation.maxPublishers,
    maxTerritories: congregation.maxTerritories,
    maxUsers: congregation.maxUsers,
    maxStorageBytes: congregation.maxStorageBytes,
    maxBoardDocuments: congregation.maxBoardDocuments,
    suspendedAt: congregation.suspendedAt,
    suspendedReason: congregation.suspendedReason,
    trialEndsAt: congregation.trialEndsAt,
  }
}

export function getPlatformName(): string {
  return DEFAULT_PLATFORM_NAME
}

/**
 * Resolves the congregation matching the subdomain or custom domain from the request.
 *
 * - Returns `null` in single-tenant mode or if no slug is extracted from the URL (root domain).
 * - Redirects to `/congregation-not-found` if a slug is present but doesn't match any congregation.
 */
export async function resolveCongregationFromRequest(request: Request): Promise<{ id: number; slug: string } | null> {
  if (process.env.MULTI_TENANT !== 'true') return null

  const hostname = new URL(request.url).hostname
  const appBaseUrl = (process.env.APP_BASE_URL ?? 'unitae.app').replace('https://', '').replace('http://', '')
  const slug = hostname.endsWith(appBaseUrl) ? hostname.replace(`.${appBaseUrl}`, '') : null

  if (slug) {
    const congregation = await unscopedDb.congregation.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    })
    if (congregation) return congregation

    // Slug is present in the URL but doesn't match any congregation
    throw redirect('/congregation-not-found')
  }

  // No slug — try resolving by custom domain
  const congregation = await unscopedDb.congregation.findFirst({
    where: { domain: hostname },
    select: { id: true, slug: true },
  })
  if (congregation) return congregation

  // Root domain or unknown domain without slug — no congregation to resolve
  return null
}

const DEFAULT_CONGREGATION_NAME = 'Ma Congrégation'

export async function getBrandingName(request?: Request): Promise<string> {
  let congregation: { name: string; displayName: string | null } | null = null

  if (process.env.MULTI_TENANT === 'true' && request) {
    const hostname = new URL(request.url).hostname
    const appBaseUrl = (process.env.APP_BASE_URL ?? 'unitae.app').replace('https://', '').replace('http://', '')
    const slug = hostname.endsWith(appBaseUrl) ? hostname.replace(`.${appBaseUrl}`, '') : null

    if (slug) {
      congregation = await unscopedDb.congregation.findUnique({
        where: { slug },
        select: { name: true, displayName: true },
      })
    }
    if (!congregation) {
      congregation = await unscopedDb.congregation.findFirst({
        where: { domain: hostname },
        select: { name: true, displayName: true },
      })
    }
  } else {
    congregation = await unscopedDb.congregation.findFirst({
      select: { name: true, displayName: true },
    })
  }

  if (!congregation) return DEFAULT_PLATFORM_NAME

  if (congregation.displayName && congregation.displayName !== DEFAULT_CONGREGATION_NAME) {
    return congregation.displayName
  }

  if (congregation.name !== DEFAULT_CONGREGATION_NAME) {
    return congregation.name
  }

  return DEFAULT_PLATFORM_NAME
}
