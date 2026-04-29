import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'

export function serializeSharedEntranceFromBuilding(building: DetailedBuilding | null): string {
  const residentialEntrance = building?.entrances.find(e => e.kind === EntranceKind.Residential)
  if (residentialEntrance == null) {
    return ''
  }

  return residentialEntrance.buildings.map(el => el.id).join(',')
}
