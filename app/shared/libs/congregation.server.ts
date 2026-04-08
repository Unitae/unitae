import { congregationContext, unscopedDb } from '~/shared/libs/db.server'

const DEFAULT_PLATFORM_NAME = 'Unitae'
const DEFAULT_EMAIL_FROM = 'Unitae <noreply@unitae.app>'

export type CongregationInfo = {
  id: number
  name: string
  slug: string
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
}

export function getCongregationFromContext(): CongregationInfo | null {
  const ctx = congregationContext.getStore()
  return ctx?.congregation ?? null
}

export function requireCongregation(): CongregationInfo {
  const congregation = getCongregationFromContext()
  if (!congregation) {
    throw new Error('Congregation context is required but not set')
  }
  return congregation
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
    displayName: congregation.displayName ?? congregation.name,
    emailFrom: congregation.emailFromAddress
      ? `${congregation.emailFromName ?? congregation.name} <${congregation.emailFromAddress}>`
      : DEFAULT_EMAIL_FROM,
    baseUrl: congregation.baseUrl ?? `https://${congregation.slug}.${appBaseUrl.replace('https://', '')}`,
    plan: congregation.plan,
    maxPublishers: congregation.maxPublishers,
    maxTerritories: congregation.maxTerritories,
    maxUsers: congregation.maxUsers,
    maxStorageBytes: congregation.maxStorageBytes,
    maxBoardDocuments: congregation.maxBoardDocuments,
    suspendedAt: congregation.suspendedAt,
    suspendedReason: congregation.suspendedReason,
  }
}

export function getPlatformName(): string {
  return DEFAULT_PLATFORM_NAME
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
