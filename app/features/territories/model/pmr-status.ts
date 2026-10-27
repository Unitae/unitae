import * as m from '~/i18n/paraglide/messages'
import { EntranceKind } from './entrance-kind.type'
import { TerritoryKindKey } from './territory-kind.type'

/**
 * PMR status of a territory, also the `pmr` filter's URL values. The third is
 * `not` rather than `none`: the filter forms and chips reserve `none` for "no filter".
 */
export const PMR_STATUSES = ['full', 'partial', 'not'] as const
export type PmrStatus = (typeof PMR_STATUSES)[number]

export function isPmrStatus(value: string | null): value is PmrStatus {
  return (PMR_STATUSES as readonly (string | null)[]).includes(value)
}

export function pmrStatusLabels(): Record<PmrStatus, string> {
  return {
    full: m.territories_pmr_full(),
    partial: m.territories_pmr_partial(),
    not: m.territories_pmr_not(),
  }
}

/**
 * Accessibility of a door-to-door (`Classical`) territory for people with reduced mobility,
 * from its residential entrances. An entrance never checked (`isPMR` null)
 * counts as not PMR. `null` when the territory has no PMR status: another kind,
 * or no residential entrance.
 */
export function getTerritoryPmrStatus(
  type: TerritoryKindKey,
  entrances: { kind: EntranceKind; isPMR: boolean | null }[],
): PmrStatus | null {
  if (type !== TerritoryKindKey.Classical) return null

  const residential = entrances.filter(e => e.kind === EntranceKind.Residential)
  if (residential.length === 0) return null

  const pmrCount = residential.filter(e => e.isPMR === true).length
  if (pmrCount === residential.length) return 'full'
  return pmrCount > 0 ? 'partial' : 'not'
}
