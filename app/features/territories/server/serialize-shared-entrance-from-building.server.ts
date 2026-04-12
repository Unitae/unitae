import type { DetailedBuilding } from '~/features/territories/model/detailed-building.type'

export function serializeSharedEntranceFromBuilding(building: DetailedBuilding | null): string {
  const residentialEntrance = building?.entrances.find(e => e.kind === 'residential')
  if (residentialEntrance == null) {
    return ''
  }

  return residentialEntrance.buildings.map(el => el.id).join(',')
}
