import type { Bbox } from '~/features/territories/model/bbox.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'

export type EntrancesInBboxParams =
  | { mode: 'edit'; bbox: Bbox; territoryId: number }
  | { mode: 'create'; bbox: Bbox; kind: TerritoryKind }

function parseBbox(value: string | null): Bbox | null {
  if (!value) return null
  const parts = value.split(',').map(Number)
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return null
  const [swLat, swLng, neLat, neLng] = parts
  return { swLat, swLng, neLat, neLng }
}

function parseKind(value: string | null): TerritoryKind | null {
  if (value == null) return null
  return (Object.values(TerritoryKind) as string[]).includes(value) ? (value as TerritoryKind) : null
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

  if (mode === 'create') {
    const kind = parseKind(searchParams.get('kind'))
    if (kind == null) return null
    return { mode: 'create', bbox, kind }
  }

  return null
}
