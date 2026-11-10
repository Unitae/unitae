import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

import { type ReassignmentInput, setTerritoryEntrances } from './territory-entrances.server'
import { assertTerritoryNumberFree } from './territory-number.server'

export interface CreateTerritoryParams {
  number: string
  type: TerritoryKindKey
  entranceIds: number[]
  /** Entrances taken from another territory of the same type. */
  reassignments?: ReassignmentInput[]
  congregationId: number
  actorId: number
}

/**
 * Creates a territory with its entrances. The number must be free in the congregation, and the entrances follow the
 * editor's rule (see `setTerritoryEntrances`): any refusal leaves nothing behind, the caller's transaction rolls back.
 */
export async function createTerritory(db: TransactionClient, params: CreateTerritoryParams) {
  const number = params.number.trim()
  await assertTerritoryNumberFree(db, params.congregationId, number)

  const territory = await db.territory.create({
    data: { number, type: params.type, congregationId: params.congregationId },
  })

  await setTerritoryEntrances(
    db,
    territory,
    { entranceIds: params.entranceIds, reassignments: params.reassignments },
    params.congregationId,
    params.actorId,
  )

  audit({
    action: AuditAction.TerritoryCreated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'Territory',
    entityId: territory.id,
  })

  return territory
}
