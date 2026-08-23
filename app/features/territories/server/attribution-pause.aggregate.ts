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

export interface CampaignTransitionParams {
  congregationId: number
  campaignId: number
  /** Restrict to these territories (campaign scope); null = whole congregation. */
  territoryIds: number[] | null
  actorId: number
  now: Date
}

function territoryFilter(territoryIds: number[] | null) {
  return territoryIds != null ? { territoryId: { in: territoryIds } } : {}
}

function auditEach(ids: number[], action: AuditAction, params: CampaignTransitionParams): void {
  for (const id of ids) {
    audit({
      action,
      congregationId: params.congregationId,
      actorId: params.actorId,
      entityType: 'Attribution',
      entityId: id,
      metadata: { campaignId: params.campaignId, bulk: true },
    })
  }
}

/**
 * Campaign start, `Pause`: suspend every open, unpaused regular attribution in
 * scope. Returns the affected rows so `startAutoReassign` can re-create the
 * same publisher/territory pairs inside the campaign.
 */
export async function pauseOpenRegulars(db: TransactionClient, params: CampaignTransitionParams) {
  // aggregate-boundaries-allow: precondition read — ids for the updateMany + per-row audit fan-out
  const rows = await db.attribution.findMany({
    where: {
      congregationId: params.congregationId,
      endDate: null,
      campaignId: null,
      pausedAt: null,
      ...territoryFilter(params.territoryIds),
    },
    select: { id: true, publisherId: true, territoryId: true },
  })
  if (rows.length === 0) return rows

  await db.attribution.updateMany({
    where: { id: { in: rows.map(r => r.id) }, congregationId: params.congregationId },
    data: { pausedAt: params.now, pausedByCampaignId: params.campaignId },
  })
  auditEach(
    rows.map(r => r.id),
    AuditAction.AttributionPaused,
    params,
  )
  return rows
}

/** Campaign start, `Close`: return every open regular attribution in scope. */
export async function closeOpenRegulars(db: TransactionClient, params: CampaignTransitionParams): Promise<number> {
  // aggregate-boundaries-allow: precondition read — ids for the updateMany + per-row audit fan-out
  const rows = await db.attribution.findMany({
    where: {
      congregationId: params.congregationId,
      endDate: null,
      campaignId: null,
      ...territoryFilter(params.territoryIds),
    },
    select: { id: true },
  })
  if (rows.length === 0) return 0

  await db.attribution.updateMany({
    where: { id: { in: rows.map(r => r.id) }, congregationId: params.congregationId },
    data: { endDate: params.now },
  })
  auditEach(
    rows.map(r => r.id),
    AuditAction.AttributionUpdated,
    params,
  )
  return rows.length
}

/**
 * Campaign end, `Resume`: lift the pause on attributions paused *by this
 * campaign* — a `KeepPaused` leftover from an earlier campaign is untouched.
 * Each `lateDate` shifts by that row's own paused duration.
 */
export async function resumePausedBy(db: TransactionClient, params: CampaignTransitionParams): Promise<number> {
  // aggregate-boundaries-allow: precondition read — per-row lateDate shift + audit fan-out
  const rows = await db.attribution.findMany({
    where: {
      congregationId: params.congregationId,
      pausedByCampaignId: params.campaignId,
      endDate: null,
      ...territoryFilter(params.territoryIds),
    },
    select: { id: true, pausedAt: true, lateDate: true },
  })

  for (const row of rows) {
    const pausedMs = row.pausedAt != null ? params.now.getTime() - row.pausedAt.getTime() : 0
    await db.attribution.update({
      // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
      where: { id_congregationId: { id: row.id, congregationId: params.congregationId } },
      data: { pausedAt: null, pausedByCampaignId: null, lateDate: new Date(row.lateDate.getTime() + pausedMs) },
    })
  }
  auditEach(
    rows.map(r => r.id),
    AuditAction.AttributionResumed,
    params,
  )
  return rows.length
}

/** Campaign end, `Close`: return attributions paused by this campaign. */
export async function closePausedBy(db: TransactionClient, params: CampaignTransitionParams): Promise<number> {
  // aggregate-boundaries-allow: precondition read — ids for the updateMany + per-row audit fan-out
  const rows = await db.attribution.findMany({
    where: {
      congregationId: params.congregationId,
      pausedByCampaignId: params.campaignId,
      endDate: null,
      ...territoryFilter(params.territoryIds),
    },
    select: { id: true },
  })
  if (rows.length === 0) return 0

  await db.attribution.updateMany({
    where: { id: { in: rows.map(r => r.id) }, congregationId: params.congregationId },
    data: { endDate: params.now, pausedAt: null, pausedByCampaignId: null },
  })
  auditEach(
    rows.map(r => r.id),
    AuditAction.AttributionUpdated,
    params,
  )
  return rows.length
}

/** Campaign end (or scope removal): close the campaign's own open attributions. */
export async function closeOpenCampaignAttributions(
  db: TransactionClient,
  params: CampaignTransitionParams,
): Promise<number> {
  // aggregate-boundaries-allow: precondition read — ids for the updateMany + per-row audit fan-out
  const rows = await db.attribution.findMany({
    where: {
      congregationId: params.congregationId,
      campaignId: params.campaignId,
      endDate: null,
      ...territoryFilter(params.territoryIds),
    },
    select: { id: true },
  })
  if (rows.length === 0) return 0

  await db.attribution.updateMany({
    where: { id: { in: rows.map(r => r.id) }, congregationId: params.congregationId },
    data: { endDate: params.now },
  })
  auditEach(
    rows.map(r => r.id),
    AuditAction.AttributionUpdated,
    params,
  )
  return rows.length
}
