import { z } from 'zod'

export type CardOverlayPath = { lat: number; lng: number }

export type CardOverlay = {
  id: number
  name: string | null
  color: string
  paths: CardOverlayPath[]
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const DEFAULT_OVERLAY_COLOR = '#C2175B'

export const cardOverlayColorSchema = z
  .string()
  .regex(HEX_COLOR_PATTERN, 'La couleur doit être au format hexadécimal (ex: #C2175B)')

export const cardOverlayPointSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
})

// Reusable for the future congregation-perimeter migration: a closed polygon ring with ≥ 3 unique
// vertices. The transform auto-closes the ring (repeats the first point at the end) when the input
// isn't already closed, so callers don't have to think about it.
export const cardOverlayPathsSchema = z
  .array(cardOverlayPointSchema)
  .min(3, 'Un polygone doit contenir au moins 3 sommets')
  .transform(points => {
    const first = points[0]
    const last = points[points.length - 1]
    if (first.lat === last.lat && first.lng === last.lng) return points
    return [...points, { lat: first.lat, lng: first.lng }]
  })

export const cardOverlayNameSchema = z
  .string()
  .trim()
  .max(80, 'Le nom ne peut pas dépasser 80 caractères')
  .nullable()
  .transform(value => (value == null || value.length === 0 ? null : value))

const geoJsonPositionSchema = z.tuple([z.number(), z.number()])

const geoJsonPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(geoJsonPositionSchema)).min(1),
})

const geoJsonMultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(geoJsonPositionSchema)).min(1)).min(1),
})

const PERIMETER_ROLE = 'perimeter'

const geoJsonFeatureSchema = z.object({
  type: z.literal('Feature'),
  properties: z
    .object({
      name: z.string().nullable().optional(),
      color: z.string().optional(),
      stroke: z.string().optional(),
      fill: z.string().optional(),
      role: z.string().optional(),
    })
    .nullable()
    .optional(),
  geometry: z.union([geoJsonPolygonSchema, geoJsonMultiPolygonSchema]),
})

const geoJsonInputSchema = z.union([
  geoJsonFeatureSchema,
  z.object({
    type: z.literal('FeatureCollection'),
    features: z.array(geoJsonFeatureSchema).min(1),
  }),
])

export type CardOverlayDraft = {
  name: string | null
  color: string
  paths: CardOverlayPath[]
}

function ringToPaths(ring: [number, number][]): CardOverlayPath[] {
  return ring.map(([lng, lat]) => ({ lat, lng }))
}

function pickColor(properties: { color?: string; stroke?: string; fill?: string } | null | undefined): string {
  const candidate = properties?.color ?? properties?.stroke ?? properties?.fill
  if (candidate != null && HEX_COLOR_PATTERN.test(candidate)) return candidate
  return DEFAULT_OVERLAY_COLOR
}

function pickName(properties: { name?: string | null } | null | undefined): string | null {
  const value = properties?.name
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export class GeoJsonValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeoJsonValidationError'
  }
}

export type GeoJsonImport = {
  zones: CardOverlayDraft[]
  perimeter: CardOverlayPath[] | null
}

/**
 * Parses a GeoJSON Feature/FeatureCollection into our internal split between zones and the
 * congregation perimeter. A feature is treated as the perimeter when `properties.role === "perimeter"`
 * (the marker `buildGeoJsonExport` writes); everything else becomes a card-overlay zone draft.
 *
 * Constraints:
 * - At most one perimeter feature is allowed (extras throw).
 * - The perimeter must be a Polygon (a MultiPolygon there throws — the perimeter is a single ring).
 * - The result must contain at least one zone or one perimeter; otherwise the import is rejected.
 */
export function parseGeoJsonImport(input: unknown): GeoJsonImport {
  const parsed = geoJsonInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new GeoJsonValidationError('Le GeoJSON est invalide ou ne contient pas de polygones exploitables')
  }

  const features = parsed.data.type === 'Feature' ? [parsed.data] : parsed.data.features
  const zones: CardOverlayDraft[] = []
  let perimeter: CardOverlayPath[] | null = null

  for (const feature of features) {
    const properties = feature.properties ?? null
    const isPerimeter = properties?.role === PERIMETER_ROLE
    const name = pickName(properties)

    if (isPerimeter) {
      if (perimeter != null) {
        throw new GeoJsonValidationError('Le fichier contient plusieurs périmètres — un seul est autorisé')
      }
      if (feature.geometry.type !== 'Polygon') {
        throw new GeoJsonValidationError('Le périmètre doit être un Polygon (et non un MultiPolygon)')
      }
      const paths = cardOverlayPathsSchema.safeParse(ringToPaths(feature.geometry.coordinates[0]))
      if (!paths.success) {
        throw new GeoJsonValidationError(`Périmètre : ${paths.error.issues[0]?.message ?? 'invalide'}`)
      }
      perimeter = paths.data
      continue
    }

    const color = pickColor(properties)
    const rings: [number, number][][] =
      feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates[0]] : feature.geometry.coordinates.map(p => p[0])

    for (const ring of rings) {
      const paths = cardOverlayPathsSchema.safeParse(ringToPaths(ring))
      if (!paths.success) {
        throw new GeoJsonValidationError(
          `Polygone "${name ?? 'sans nom'}" : ${paths.error.issues[0]?.message ?? 'invalide'}`,
        )
      }
      zones.push({ name, color, paths: paths.data })
    }
  }

  if (zones.length === 0 && perimeter == null) {
    throw new GeoJsonValidationError('Le GeoJSON ne contient aucun polygone valide')
  }

  return { zones, perimeter }
}

type GeoJsonZoneFeature = {
  type: 'Feature'
  properties: { name: string | null; color: string }
  geometry: { type: 'Polygon'; coordinates: [number, number][][] }
}

type GeoJsonPerimeterFeature = {
  type: 'Feature'
  properties: { role: 'perimeter' }
  geometry: { type: 'Polygon'; coordinates: [number, number][][] }
}

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: (GeoJsonZoneFeature | GeoJsonPerimeterFeature)[]
}

function pathsToRing(paths: CardOverlayPath[]): [number, number][] {
  return paths.map(({ lat, lng }) => [lng, lat] as [number, number])
}

/**
 * Serializes the assembly map (zones + optional perimeter) to a single GeoJSON FeatureCollection
 * suitable for round-tripping through `parseGeoJsonImport`. Zone features carry `name` + `color`;
 * the perimeter feature carries `properties.role: "perimeter"` so the importer knows where to put it.
 */
export function buildGeoJsonExport(
  overlays: CardOverlay[],
  perimeter: CardOverlayPath[] | null = null,
): GeoJsonFeatureCollection {
  const features: (GeoJsonZoneFeature | GeoJsonPerimeterFeature)[] = overlays.map(overlay => ({
    type: 'Feature',
    properties: { name: overlay.name, color: overlay.color },
    geometry: { type: 'Polygon', coordinates: [pathsToRing(overlay.paths)] },
  }))
  if (perimeter != null && perimeter.length >= 3) {
    features.push({
      type: 'Feature',
      properties: { role: 'perimeter' },
      geometry: { type: 'Polygon', coordinates: [pathsToRing(perimeter)] },
    })
  }
  return { type: 'FeatureCollection', features }
}
