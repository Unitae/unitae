import type { Building } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { BuildingProspectionInput } from '~/features/territories/schemas/building-prospection.schema'
import type { TransactionClient } from '~/shared/infra/db.server'
import { setBuildingProspectionData } from './set-building-prospection-data.server'
import { updateBuildingsInEntrance } from './update-buildings-in-entrance.server'

export interface SaveBuildingProspectionParams {
  buildingId: number
  congregationId: number
  actorId: number
  input: BuildingProspectionInput
  /** The other buildings sharing the residential entrance, or `null` when the actor may not change them. */
  sharedWith: number[] | null
}

/**
 * Saves the prospection page in one go: which buildings share the residential entrance, then the figures and
 * entrances. Links come first so the figures land on the entrance the building ends up in; an entrance created
 * by this save is linked once it exists. Run it inside one transaction: any failure undoes both.
 */
export async function saveBuildingProspection(
  db: TransactionClient,
  { buildingId, congregationId, actorId, input, sharedWith }: SaveBuildingProspectionParams,
): Promise<Building> {
  const links = sharedWith != null && input['has-residential'] ? [...new Set([buildingId, ...sharedWith])] : null

  const before = await findResidentialEntrance(db, buildingId, congregationId)
  if (links != null && before != null && !sameMembers(before.buildingIds, links)) {
    await updateBuildingsInEntrance(db, before.id, links, congregationId, actorId)
  }

  const building = await setBuildingProspectionData(db, buildingId, congregationId, input, actorId)

  if (links != null && before == null && links.length > 1) {
    const created = await findResidentialEntrance(db, buildingId, congregationId)
    if (created != null) await updateBuildingsInEntrance(db, created.id, links, congregationId, actorId)
  }

  return building
}

async function findResidentialEntrance(db: TransactionClient, buildingId: number, congregationId: number) {
  const entrance = await db.buildingEntrance.findFirst({
    where: { congregationId, kind: EntranceKind.Residential, buildings: { some: { id: buildingId } } },
    orderBy: { id: 'asc' },
    select: { id: true, buildings: { select: { id: true } } },
  })
  return entrance && { id: entrance.id, buildingIds: entrance.buildings.map(({ id }) => id) }
}

function sameMembers(current: number[], wanted: number[]): boolean {
  return current.length === wanted.length && wanted.every(id => current.includes(id))
}
