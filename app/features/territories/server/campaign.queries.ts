import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * The single source of truth for "is campaign mode on?" — the aggregate's
 * creation guard, the routes and the banner all read this. Derived from the
 * job's bookkeeping stamps (`activatedAt`/`endedAt`), never from the clock,
 * so it stays correct even when the sweep runs late.
 */
export function getActiveCampaign(db: TransactionClient, congregationId: number) {
  return db.campaign.findFirst({
    where: { congregationId, activatedAt: { not: null }, endedAt: null },
    include: { scope: { select: { territoryId: true } } },
  })
}

/** Campaigns whose scheduled start has passed and were never activated. */
export function getCampaignsDueToActivate(db: TransactionClient, congregationId: number, now: Date) {
  return db.campaign.findMany({
    where: { congregationId, activatedAt: null, endedAt: null, startDate: { lte: now } },
    include: { scope: { select: { territoryId: true } } },
  })
}

/**
 * Campaigns whose inclusive endDate is fully past (the sweep runs on the
 * morning *after* the last campaign day) and that are still running.
 */
export function getCampaignsDueToEnd(db: TransactionClient, congregationId: number, now: Date) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return db.campaign.findMany({
    where: { congregationId, activatedAt: { not: null }, endedAt: null, endDate: { lt: startOfToday } },
    include: { scope: { select: { territoryId: true } } },
  })
}

/** Effective scope helper: an empty campaign scope means every territory. */
export async function listAllTerritoryIds(db: TransactionClient, congregationId: number): Promise<number[]> {
  const territories = await db.territory.findMany({ where: { congregationId }, select: { id: true } })
  return territories.map(t => t.id)
}

/** Campaign list for the CRUD screens — newest window first, with scope size. */
export function listCampaigns(db: TransactionClient, congregationId: number) {
  return db.campaign.findMany({
    where: { congregationId },
    orderBy: { startDate: 'desc' },
    // biome-ignore lint/style/useNamingConvention: Prisma count aggregation key
    include: { _count: { select: { scope: true } } },
  })
}

/** One campaign with its scope, or null. */
export function getCampaign(db: TransactionClient, id: number, congregationId: number) {
  return db.campaign.findFirst({
    where: { id, congregationId },
    include: { scope: { select: { territoryId: true } } },
  })
}

/** Next scheduled campaign for the banner — never activated, window not past. */
export function getUpcomingCampaign(db: TransactionClient, congregationId: number, now: Date) {
  return db.campaign.findFirst({
    where: { congregationId, activatedAt: null, endedAt: null, endDate: { gte: now } },
    orderBy: { startDate: 'asc' },
  })
}
