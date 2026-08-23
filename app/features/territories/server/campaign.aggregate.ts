import type {
  CampaignRegularEndAction,
  CampaignRegularStartAction,
} from '~/features/territories/model/campaign-lifecycle.type'
import { getCampaignStatus } from '~/features/territories/model/campaign-status'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { parseLocalDate } from '~/shared/utils/date.server'

/**
 * Two campaign windows overlap iff each starts on or before the other ends.
 * Both bounds are day-granular and inclusive (`endDate` is the last day the
 * campaign runs), so windows sharing a single day conflict — same semantics
 * as `attributionsOverlap`. This predicate is what makes "campaign mode" a
 * single on/off: at most one campaign can hold any given day.
 *
 * Pure predicate — exported for unit testing.
 */
export function campaignWindowsOverlap(
  a: { startDate: Date; endDate: Date },
  b: { startDate: Date; endDate: Date },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate
}

async function _assertNoWindowOverlap(
  db: TransactionClient,
  congregationId: number,
  startDate: Date,
  endDate: Date,
  excludeId?: number,
): Promise<void> {
  const candidates = await db.campaign.findMany({
    where: {
      congregationId,
      ...(excludeId != null ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, startDate: true, endDate: true },
  })
  const candidate = { startDate, endDate }
  const overlap = candidates.find(existing => campaignWindowsOverlap(candidate, existing))
  if (overlap) {
    throw new ConflictError('campaign_overlap')
  }
}

export interface CampaignParams {
  name: string
  notes: string
  startDate: string
  endDate: string
  durationDays: number | null
  startRegularAction: CampaignRegularStartAction
  startAutoReassign: boolean
  endCloseCampaign: boolean
  endRegularAction: CampaignRegularEndAction
  scopeTerritoryIds: number[]
  congregationId: number
  actorId: number
}

export async function createCampaign(db: TransactionClient, params: CampaignParams) {
  const startDate = parseLocalDate(params.startDate)
  const endDate = parseLocalDate(params.endDate)

  await _assertNoWindowOverlap(db, params.congregationId, startDate, endDate)

  const campaign = await db.campaign.create({
    data: {
      name: params.name,
      notes: params.notes,
      startDate,
      endDate,
      durationDays: params.durationDays,
      startRegularAction: params.startRegularAction,
      startAutoReassign: params.startAutoReassign,
      endCloseCampaign: params.endCloseCampaign,
      endRegularAction: params.endRegularAction,
      congregationId: params.congregationId,
    },
  })

  if (params.scopeTerritoryIds.length > 0) {
    await db.campaignTerritory.createMany({
      data: params.scopeTerritoryIds.map(territoryId => ({
        campaignId: campaign.id,
        territoryId,
        congregationId: params.congregationId,
      })),
    })
  }

  audit({
    action: AuditAction.CampaignCreated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'Campaign',
    entityId: campaign.id,
    metadata: { name: params.name, scopeSize: params.scopeTerritoryIds.length },
  })

  return campaign
}

export async function updateCampaign(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: CampaignParams,
) {
  const existing = await db.campaign.findFirst({
    where: { id, congregationId },
    select: { id: true, activatedAt: true, endedAt: true },
  })
  if (!existing) throw new NotFoundError('Campaign', id)

  const startDate = parseLocalDate(params.startDate)
  const endDate = parseLocalDate(params.endDate)

  await _assertNoWindowOverlap(db, congregationId, startDate, endDate, id)

  const campaign = await db.campaign.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
    data: {
      name: params.name,
      notes: params.notes,
      startDate,
      endDate,
      durationDays: params.durationDays,
      startRegularAction: params.startRegularAction,
      startAutoReassign: params.startAutoReassign,
      endCloseCampaign: params.endCloseCampaign,
      endRegularAction: params.endRegularAction,
    },
  })

  await replaceScope(db, id, congregationId, params.scopeTerritoryIds)

  audit({
    action: AuditAction.CampaignUpdated,
    congregationId,
    actorId,
    entityType: 'Campaign',
    entityId: id,
    metadata: { scopeSize: params.scopeTerritoryIds.length },
  })

  return campaign
}

/**
 * Raw scope replacement — no lifecycle side effects. For an *active* campaign
 * the caller must be the campaign-lifecycle workflow, which applies the
 * start/end transitions to added/removed territories before persisting here.
 */
export async function replaceScope(
  db: TransactionClient,
  campaignId: number,
  congregationId: number,
  territoryIds: number[],
): Promise<void> {
  await db.campaignTerritory.deleteMany({ where: { campaignId, congregationId } })
  if (territoryIds.length > 0) {
    await db.campaignTerritory.createMany({
      data: territoryIds.map(territoryId => ({ campaignId, territoryId, congregationId })),
    })
  }
}

export async function deleteCampaign(db: TransactionClient, id: number, congregationId: number, actorId: number) {
  const existing = await db.campaign.findFirst({
    where: { id, congregationId },
    select: { id: true, activatedAt: true, endedAt: true },
  })
  if (!existing) throw new NotFoundError('Campaign', id)

  if (getCampaignStatus(existing) === 'active') {
    // An active campaign holds paused regulars and live campaign attributions —
    // it must be ended (running its end transitions) before it can be deleted.
    throw new ConflictError('campaign_active')
  }

  const campaign = await db.campaign.delete({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
  })

  audit({
    action: AuditAction.CampaignDeleted,
    congregationId,
    actorId,
    entityType: 'Campaign',
    entityId: id,
  })

  return campaign
}
