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
