import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { TransactionClient } from '~/shared/infra/db.server'

export function countBuildingsMissingDemographics(db: TransactionClient, congregationId: number): Promise<number> {
  return db.building.count({
    where: {
      congregationId,
      inTerritory: true,
      entrances: { some: { kind: EntranceKind.Residential } },
      OR: [{ residentialData: null }, { residentialData: { homes: null } }, { residentialData: { phones: null } }],
    },
  })
}
