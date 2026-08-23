import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Suspend an open attribution for a campaign: still held (endDate stays null)
 * but inactive — hidden from working lists, overdue clock frozen.
 * `pausedByCampaignId` records ownership so only that campaign's end (or a
 * manual resume) releases it.
 */
export async function pause(
  db: TransactionClient,
  id: number,
  congregationId: number,
  campaignId: number,
  actorId: number,
  now: Date = new Date(),
) {
  const existing = await db.attribution.findFirst({
    where: { id, congregationId },
    select: { id: true, endDate: true, pausedAt: true },
  })
  if (!existing) throw new NotFoundError('Attribution', id)
  if (existing.endDate != null) throw new ConflictError('attribution_not_open')
  if (existing.pausedAt != null) throw new ConflictError('attribution_already_paused')

  const attribution = await db.attribution.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
    data: { pausedAt: now, pausedByCampaignId: campaignId },
  })

  audit({
    action: AuditAction.AttributionPaused,
    congregationId,
    actorId,
    entityType: 'Attribution',
    entityId: id,
    metadata: { campaignId },
  })

  return attribution
}

/**
 * Lift the pause: clears the pause state and pushes `lateDate` back by the
 * time spent paused, so nobody comes out of a campaign retroactively late.
 */
export async function resume(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  now: Date = new Date(),
) {
  const existing = await db.attribution.findFirst({
    where: { id, congregationId },
    select: { id: true, pausedAt: true, lateDate: true, pausedByCampaignId: true },
  })
  if (!existing) throw new NotFoundError('Attribution', id)
  if (existing.pausedAt == null) throw new ConflictError('attribution_not_paused')

  const lateDate = new Date(existing.lateDate.getTime() + (now.getTime() - existing.pausedAt.getTime()))

  const attribution = await db.attribution.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
    data: { pausedAt: null, pausedByCampaignId: null, lateDate },
  })

  audit({
    action: AuditAction.AttributionResumed,
    congregationId,
    actorId,
    entityType: 'Attribution',
    entityId: id,
    metadata: { pausedByCampaignId: existing.pausedByCampaignId },
  })

  return attribution
}
