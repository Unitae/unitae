import type { Bbox } from '~/features/territories/model/bbox.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { FreeEntranceFilters } from '~/features/territories/server/map-visibility'

export type EntrancesInBboxParams =
  | { mode: 'edit'; bbox: Bbox; territoryId: number }
  /** The split tool: free entrances only, within its filters. */
  | { mode: 'create'; bbox: Bbox; kind: TerritoryKindKey; filters: FreeEntranceFilters }
  /** The territory editor creating a territory: what the edit map shows, without a territory of its own yet. */
  | { mode: 'new'; bbox: Bbox; kind: TerritoryKindKey }

function parseBbox(value: string | null): Bbox | null {
  if (!value) return null
  const parts = value.split(',').map(Number)
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return null
  const [swLat, swLng, neLat, neLng] = parts
  return { swLat, swLng, neLat, neLng }
}

function parseKind(value: string | null): TerritoryKindKey | null {
  if (value == null) return null
  return (Object.values(TerritoryKindKey) as string[]).includes(value) ? (value as TerritoryKindKey) : null
}

export function parseEntrancesInBboxParams(searchParams: URLSearchParams): EntrancesInBboxParams | null {
  const bbox = parseBbox(searchParams.get('bbox'))
  if (bbox == null) return null

  const mode = searchParams.get('mode') ?? 'edit'

  if (mode === 'edit') {
    const territoryId = Number(searchParams.get('territoryId'))
    if (!Number.isInteger(territoryId) || territoryId <= 0) return null
    return { mode: 'edit', bbox, territoryId }
  }

  if (mode === 'create' || mode === 'new') {
    const kind = parseKind(searchParams.get('kind'))
    if (kind == null) return null
    return mode === 'create' ? { mode, bbox, kind, filters: parseFilters(searchParams) } : { mode, bbox, kind }
  }

  return null
}

/** `zip`, `access` (a way in's number) and `street`, as the split tool puts them in its address. */
export function parseFilters(searchParams: URLSearchParams): FreeEntranceFilters {
  const filters: FreeEntranceFilters = {}
  const zip = searchParams.get('zip')?.trim()
  if (zip) filters.zip = zip
  const access = Number(searchParams.get('access') ?? Number.NaN)
  if (Number.isInteger(access)) filters.access = access
  const street = searchParams.get('street')?.trim()
  if (street) filters.street = street
  return filters
}
