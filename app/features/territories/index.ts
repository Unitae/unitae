// Public surface of the territories feature.

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
export { TerritoryKind } from './model/territory-kind.type'
export * as attributionAggregate from './server/attribution.aggregate'
export { findActiveAttributionsForPublisher } from './server/attributions.server'
export {
  createCardOverlay,
  deleteCardOverlay,
  listCardOverlays,
  updateCardOverlay,
} from './server/card-overlays.server'
export { clearPerimeter, getPerimeter, setPerimeter } from './server/perimeter.server'
export { getAllowedZips, parseZips, serializeZips } from './server/settings.server'
export { AttributionStatus } from './ui/AttributionStatus'
export { default as CardOverlayMap } from './ui/CardOverlayMap'
export { ColorPicker } from './ui/ColorPicker'
