import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { getSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

const DEFAULT_DURATION_DAYS = {
  default: 120,
  campaign: 60,
  phone: 14,
  commerce: 120,
}

export interface CreateAttributionParams {
  publisherId: number
  territoryId: number
  startDate: string
  notes: string
  type: TerritoryAttributionKind
  congregationId: number
}

function parsePositiveDays(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

async function resolveDurationDays(
  db: TransactionClient,
  attributionType: TerritoryAttributionKind,
  territoryType: TerritoryKind,
  congregationId: number,
): Promise<number> {
  if (attributionType === TerritoryAttributionKind.Phone) {
    const setting = await getSetting(db, TerritorySettingKey.AttributionPhoneDurationDays, congregationId)
    return parsePositiveDays(setting, DEFAULT_DURATION_DAYS.phone)
  }

  if (attributionType === TerritoryAttributionKind.Campaign) {
    const setting = await getSetting(db, TerritorySettingKey.AttributionCampaignDurationDays, congregationId)
    return parsePositiveDays(setting, DEFAULT_DURATION_DAYS.campaign)
  }

  if (territoryType === TerritoryKind.Commerces) {
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

export async function createAttribution(db: TransactionClient, params: CreateAttributionParams) {
  const territory = await db.territory.findUniqueOrThrow({ where: { id: params.territoryId } })

  const durationDays = await resolveDurationDays(db, params.type, territory.type, params.congregationId)

  const lateDate = new Date(params.startDate)
  lateDate.setDate(lateDate.getDate() + durationDays)

  return db.attribution.create({
    data: {
      publisherId: params.publisherId,
      territoryId: params.territoryId,
      notes: params.notes,
      type: params.type,
      startDate: new Date(params.startDate),
      lateDate,
      congregationId: params.congregationId,
    },
  })
}
