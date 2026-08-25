// Public client-safe surface of the territories feature.

export { default as BuildingSyncDoneEmail } from './emails/buildings-sync-done'
export {
  buildGeoJsonExport,
  type CardOverlay,
  type CardOverlayPath,
  cardOverlayColorSchema,
  cardOverlayNameSchema,
  cardOverlayPathsSchema,
  GeoJsonValidationError,
  parseGeoJsonImport,
} from './model/card-overlay'
export type { EntranceKind } from './model/entrance-kind.type'
export type { TerritoryAttributionKind } from './model/territory-attribution-kind.type'
export { TerritoryKindKey } from './model/territory-kind.type'
export { AttributionStatus } from './ui/AttributionStatus'
export { default as CardOverlayMap } from './ui/CardOverlayMap'
export { ColorPicker } from './ui/ColorPicker'
