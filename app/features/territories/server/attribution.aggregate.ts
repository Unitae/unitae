import type { Prisma } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { getSetting } from '~/shared/domain/settings.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { parseLocalDate, startOfNextDay } from '~/shared/utils/date.server'
import { getActiveCampaign } from './campaign.queries'

const DEFAULT_DURATION_DAYS = {
  default: 120,
  phone: 14,
  commerce: 120,
}

/**
 * Two attribution intervals overlap iff each starts on or before the other
 * ends. A null endDate represents "still active" (treated as +∞).
 *
 * Endpoint-inclusive: intervals that only touch at a single endpoint
 * (`a.endDate === b.startDate`) count as overlapping — the `>=` comparison
 * treats a shared day as a conflict. Rationale: an attribution is considered
 * open for the whole of its endDate day, so a new one starting the same day
 * would run alongside it. Callers who need "next-day pickup" semantics must
 * add a day to the returning attribution's endDate before comparing.
 *
 * Pure predicate — exported for unit testing. The DB-side query in
 * `_assertNoActiveOverlap` uses the same semantics.
 */
export function attributionsOverlap(
  a: { startDate: Date; endDate: Date | null },
  b: { startDate: Date; endDate: Date | null },
): boolean {
  const aEndsAfterBStart = a.endDate == null || a.endDate >= b.startDate
  const bEndsAfterAStart = b.endDate == null || b.endDate >= a.startDate
  return aEndsAfterBStart && bEndsAfterAStart
}

function parsePositiveDays(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function _resolveDurationDays(
  db: TransactionClient,
  attributionType: TerritoryAttributionKind,
  territoryType: TerritoryKindKey,
  congregationId: number,
): Promise<number> {
  if (attributionType === TerritoryAttributionKind.Phone) {
    const setting = await getSetting(db, TerritorySettingKey.AttributionPhoneDurationDays, congregationId)
    return parsePositiveDays(setting, DEFAULT_DURATION_DAYS.phone)
  }
  if (territoryType === TerritoryKindKey.Commerces) {
    const setting = await getSetting(db, TerritorySettingKey.AttributionCommerceDurationDays, congregationId)
    return parsePositiveDays(setting, DEFAULT_DURATION_DAYS.commerce)
  }
  const setting = await getSetting(db, TerritorySettingKey.AttributionDefaultDurationDays, congregationId)
  if (setting) return parsePositiveDays(setting, DEFAULT_DURATION_DAYS.default)

  // Backward compat: fall back to legacy months setting × 30
  const legacyMonths = await getSetting(db, TerritorySettingKey.AttributionDefaultDurationMonths, congregationId)
  if (legacyMonths) {
    const months = parsePositiveDays(legacyMonths, 0)
    if (months > 0) return months * 30
  }
  return DEFAULT_DURATION_DAYS.default
}

async function _assertNoActiveOverlap(
  db: TransactionClient,
  congregationId: number,
  publisherId: number,
  territoryId: number,
  startDate: Date,
  endDate: Date | null,
  campaignId: number | null,
  excludeId?: number,
): Promise<void> {
  // Overlap is layer-scoped: regular vs regular and same-campaign vs
  // same-campaign conflict; regular and campaign work coexist by design.
  const candidates = await db.attribution.findMany({
    where: {
      congregationId,
      publisherId,
      territoryId,
      campaignId,
      ...(excludeId != null ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, startDate: true, endDate: true },
  })
  const candidate = { startDate, endDate }
  const overlap = candidates.find(existing => attributionsOverlap(candidate, existing))
  if (overlap) {
    throw new ConflictError('attribution_overlap')
  }
}

export interface CreateAttributionParams {
  publisherId: number
  territoryId: number
  startDate: string
  notes: string
  type: TerritoryAttributionKind
  /** null/absent = regular work; set = attribution inside that campaign */
  campaignId?: number | null
  congregationId: number
  actorId: number
}

export async function assign(db: TransactionClient, params: CreateAttributionParams) {
  const campaignId = params.campaignId ?? null

  // Campaign-mode guard: while a campaign is active no regular attribution can
  // be created anywhere, and campaign attributions only for the active campaign.
  const activeCampaign = await getActiveCampaign(db, params.congregationId)
  if (campaignId == null) {
    if (activeCampaign != null) throw new ConflictError('campaign_mode_active')
  } else if (activeCampaign == null || activeCampaign.id !== campaignId) {
    throw new ConflictError('campaign_not_active')
  }

  const territory = await db.territory.findUniqueOrThrow({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id: params.territoryId, congregationId: params.congregationId } },
  })

  // A territory being actively worked stays out of the campaign: only a
  // paused (or returned) attribution frees it for campaign assignment. This
  // is what makes « Laisser hors campagne » mean exactly that.
  if (campaignId != null) {
    const occupied = await db.attribution.findFirst({
      where: { congregationId: params.congregationId, territoryId: params.territoryId, endDate: null, pausedAt: null },
      select: { id: true },
    })
    if (occupied != null) throw new ConflictError('territory_occupied')
  }

  const startDate = parseLocalDate(params.startDate)
  let lateDate: Date
  if (campaignId != null && activeCampaign != null && activeCampaign.endCloseCampaign) {
    // Due when the campaign closes — the day after its inclusive end date; the
    // auto-close returns it before it can ever show as late.
    lateDate = startOfNextDay(activeCampaign.endDate)
  } else {
    // Regular work — or a campaign whose attributions are closed manually
    // (endCloseCampaign off): the standard method/territory duration applies.
    const durationDays = await _resolveDurationDays(db, params.type, territory.type, params.congregationId)
    lateDate = new Date(startDate)
    lateDate.setDate(lateDate.getDate() + durationDays)
  }

  await _assertNoActiveOverlap(
    db,
    params.congregationId,
    params.publisherId,
    params.territoryId,
    startDate,
    null,
    campaignId,
  )

  const attribution = await db.attribution.create({
    data: {
      publisherId: params.publisherId,
      territoryId: params.territoryId,
      notes: params.notes,
      type: params.type,
      campaignId,
      startDate,
      lateDate,
      congregationId: params.congregationId,
    },
  })

  audit({
    action: AuditAction.AttributionCreated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'Attribution',
    entityId: attribution.id,
    metadata: { publisherId: params.publisherId, territoryId: params.territoryId },
  })

  return attribution
}

export interface UpdateAttributionParams {
  publisherId: number
  notes: string
  type: TerritoryAttributionKind
  startDate: Date
  lateDate?: Date
  endDate?: Date
}

export async function update(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateAttributionParams,
) {
  const existing = await db.attribution.findFirst({
    where: { id, congregationId },
    select: { id: true, publisherId: true, territoryId: true, startDate: true, endDate: true, campaignId: true },
  })
  if (!existing) throw new NotFoundError('Attribution')

  const nextPublisherId = params.publisherId
  const nextTerritoryId = existing.territoryId
  const nextStart = params.startDate
  const nextEnd = params.endDate ?? existing.endDate ?? null

  const publisherChanged = nextPublisherId !== existing.publisherId
  const startChanged = nextStart.getTime() !== existing.startDate.getTime()
  const endChanged = (nextEnd?.getTime() ?? null) !== (existing.endDate?.getTime() ?? null)

  if (publisherChanged || startChanged || endChanged) {
    await _assertNoActiveOverlap(
      db,
      congregationId,
      nextPublisherId,
      nextTerritoryId,
      nextStart,
      nextEnd,
      existing.campaignId,
      id,
    )
  }

  const updateData: Prisma.XOR<Prisma.AttributionUpdateInput, Prisma.AttributionUncheckedUpdateInput> = {
    publisherId: params.publisherId,
    notes: params.notes,
    type: params.type,
    startDate: params.startDate,
  }
  if (params.lateDate != null) updateData.lateDate = params.lateDate
  if (params.endDate != null) updateData.endDate = params.endDate

  const attribution = await db.attribution.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
    data: updateData,
  })

  audit({
    action: AuditAction.AttributionUpdated,
    congregationId,
    actorId,
    entityType: 'Attribution',
    entityId: id,
  })

  return attribution
}

export async function markReturned(
  db: TransactionClient,
  id: number,
  endDate: Date,
  congregationId: number,
  actorId: number,
) {
  const attribution = await db.attribution.update({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
    data: { endDate },
  })

  audit({
    action: AuditAction.AttributionUpdated,
    congregationId,
    actorId,
    entityType: 'Attribution',
    entityId: id,
    metadata: { markedReturned: true },
  })

  return attribution
}

export async function markReturnedForPublisher(
  db: TransactionClient,
  publisherId: number,
  endDate: Date,
  congregationId: number,
  actorId: number,
): Promise<number> {
  // aggregate-boundaries-allow: precondition read — collect closed ids for the per-row audit fan-out
  const open = await db.attribution.findMany({
    where: { publisherId, congregationId, endDate: null },
    select: { id: true },
  })
  if (open.length === 0) return 0

  await db.attribution.updateMany({
    where: { publisherId, congregationId, endDate: null },
    data: { endDate },
  })

  for (const attr of open) {
    audit({
      action: AuditAction.AttributionUpdated,
      congregationId,
      actorId,
      entityType: 'Attribution',
      entityId: attr.id,
      metadata: { markedReturned: true, bulk: true },
    })
  }

  return open.length
}

export async function archive(db: TransactionClient, id: number, congregationId: number, actorId: number) {
  const attribution = await db.attribution.delete({
    // biome-ignore lint/style/useNamingConvention: Prisma compound-key naming
    where: { id_congregationId: { id, congregationId } },
    include: { publisher: true },
  })

  audit({
    action: AuditAction.AttributionDeleted,
    congregationId,
    actorId,
    entityType: 'Attribution',
    entityId: id,
  })

  return attribution
}
