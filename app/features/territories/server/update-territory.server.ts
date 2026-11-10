import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

import { type ReassignmentInput, setTerritoryEntrances } from './territory-entrances.server'
import { assertTerritoryNumberFree } from './territory-number.server'

export type { ReassignmentInput }

export interface UpdateTerritoryParams {
  /** A new number renames the territory; it must be free in the congregation. */
  number?: string
  entranceIds: number[]
  reassignments?: ReassignmentInput[]
  notes: string
}

export async function updateTerritory(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateTerritoryParams,
) {
  const target = await db.territory.findUnique({
    where: { id_congregationId: { id, congregationId } },
    select: { id: true, type: true, number: true },
  })
  if (target == null) {
    throw new ValidationError('territoryId', `Territory not found: ${id}`)
  }

  // Only a change is checked: a number older data shares with another territory can still be saved as it is.
  const number = params.number?.trim()
  const renamed = number != null && number !== target.number
  if (renamed) await assertTerritoryNumberFree(db, congregationId, number, id)

  await setTerritoryEntrances(
    db,
    target,
    { entranceIds: params.entranceIds, reassignments: params.reassignments },
    congregationId,
    actorId,
  )

  const territory = await db.territory.update({
    where: { id_congregationId: { id, congregationId } },
    data: { notes: params.notes, ...(renamed ? { number } : {}) },
  })

  audit({
    action: AuditAction.TerritoryUpdated,
    congregationId,
    actorId,
    entityType: 'Territory',
    entityId: id,
    ...(renamed ? { metadata: { number: { from: target.number, to: number } } } : {}),
  })

  return territory
}
