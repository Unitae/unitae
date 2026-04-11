import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { AggregatedEntrance } from '~/shared/types/entrance'

// Calcule le nombre de foyers/téléphones d'un territoire selon son type
export function computeTerritoryQuantity(type: string, entrances: AggregatedEntrance[]): number {
  if (type === TerritoryKind.Phone) {
    return entrances.reduce(
      (acc, entrance) => acc + entrance.buildings.reduce((acc, building) => acc + (building.phones ?? 0), 0),
      0,
    )
  }

  if (type === TerritoryKind.Classical || type === TerritoryKind.Univ) {
    return entrances.reduce(
      (acc, entrance) =>
        acc + entrance.buildings.reduce((acc, building) => acc + (building.homes ?? building.phones ?? 0), 0),
      0,
    )
  }

  return entrances.length
}
