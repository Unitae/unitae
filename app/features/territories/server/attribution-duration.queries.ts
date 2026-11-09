import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { getSetting } from '~/shared/domain/settings.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

const DEFAULT_DURATION_DAYS = {
  default: 120,
  phone: 14,
  commerce: 120,
}

function parsePositiveDays(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * How many days a new attribution runs before it is due back: the congregation's setting for phone work, for a
 * territory of businesses, or the default one (the old setting in months still counts, thirty days each); the
 * built-in durations otherwise.
 */
export async function resolveDurationDays(
  db: TransactionClient,
  attributionType: TerritoryAttributionKind | `${TerritoryAttributionKind}`,
  territoryType: TerritoryKindKey | `${TerritoryKindKey}`,
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

  const legacyMonths = await getSetting(db, TerritorySettingKey.AttributionDefaultDurationMonths, congregationId)
  if (legacyMonths) {
    const months = parsePositiveDays(legacyMonths, 0)
    if (months > 0) return months * 30
  }
  return DEFAULT_DURATION_DAYS.default
}
