import { AttributionCategory } from './attribution-category'
import { TerritoryKindKey } from './territory-kind.type'

// Server truth (`parseStatsFilterParams`) applies these when the URL has no
// `kind` / `attributionKind` params. UI code that mirrors the current filter
// scope (chip bar, dialog defaults) reads from here so display and query stay
// in lockstep.
export const DEFAULT_TERRITORY_KINDS: TerritoryKindKey[] = [TerritoryKindKey.Classical]

export const DEFAULT_ATTRIBUTION_KINDS: AttributionCategory[] = [
  AttributionCategory.Default,
  AttributionCategory.Campaign,
]
