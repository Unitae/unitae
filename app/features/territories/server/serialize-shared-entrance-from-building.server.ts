import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'

export function serializeSharedEntranceFromBuilding(building: DetailedBuilding | null): string {
  if (building?.entrance == null) {
    return ''
  }

  return building.entrance.buildings.map(el => el.id).join(',')
}
