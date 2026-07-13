import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface TerrainStats {
  homesCount: number
  phonesCount: number
  buildingsCount: number
  entrancesCount: number
  homesPerBuilding: number
  phonesCoverage: number
}

export async function computeTerrainStats(db: TransactionClient, congregationId: number): Promise<TerrainStats> {
  const [residentialSums, buildingsCount, entrancesCount] = await Promise.all([
    db.buildingEntrance.aggregate({
      where: { congregationId, kind: EntranceKind.Residential },
      _sum: { homes: true, phones: true },
    }),
    db.building.count({ where: { congregationId, inTerritory: true } }),
    db.buildingEntrance.count({ where: { congregationId } }),
  ])

  const homesCount = residentialSums._sum.homes ?? 0
  const phonesCount = residentialSums._sum.phones ?? 0

  const homesPerBuilding = buildingsCount > 0 ? Math.round(homesCount / buildingsCount) : 0
  const phonesCoverage = homesCount > 0 ? Math.round((phonesCount / homesCount) * 100) : 0

  return {
    homesCount,
    phonesCount,
    buildingsCount,
    entrancesCount,
    homesPerBuilding,
    phonesCoverage,
  }
}
