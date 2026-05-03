import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface ReassignmentInput {
  entranceId: number
  fromTerritoryId: number
}

export interface UpdateTerritoryParams {
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
    select: { id: true, type: true },
  })
  if (target == null) {
    throw new ValidationError('territoryId', `Territory not found: ${id}`)
  }

  const reassignments = params.reassignments ?? []

  for (const reassignment of reassignments) {
    if (reassignment.fromTerritoryId === id) {
      throw new ValidationError('reassignments', `Reassignment source must differ from target territory ${id}`)
    }

    const source = await db.territory.findUnique({
      where: { id_congregationId: { id: reassignment.fromTerritoryId, congregationId } },
      select: { id: true, type: true },
    })
    if (source == null) {
      throw new ValidationError('reassignments', `Source territory not found: ${reassignment.fromTerritoryId}`)
    }
    if (source.type !== target.type) {
      throw new ValidationError(
        'reassignments',
        `Source territory type ${source.type} differs from target ${target.type}`,
      )
    }

    const linked = await db.buildingEntrance.findFirst({
      where: { id: reassignment.entranceId, territories: { some: { id: source.id } } },
      select: { id: true },
    })
    if (linked == null) {
      throw new ValidationError(
        'reassignments',
        `Entrance ${reassignment.entranceId} is not linked to territory ${source.id}`,
      )
    }

    await db.buildingEntrance.update({
      where: { id: reassignment.entranceId },
      data: { territories: { disconnect: { id: source.id } } },
    })

    audit({
      action: AuditAction.EntranceReassigned,
      congregationId,
      actorId,
      entityType: 'BuildingEntrance',
      entityId: reassignment.entranceId,
      metadata: { fromTerritoryId: source.id, toTerritoryId: id },
    })
  }

  const territory = await db.territory.update({
    where: {
      id_congregationId: { id, congregationId },
    },
    data: {
      entrances: {
        set: params.entranceIds.map(entranceId => ({ id: entranceId })),
      },
      notes: params.notes,
    },
  })

  audit({
    action: AuditAction.TerritoryUpdated,
    congregationId,
    actorId,
    entityType: 'Territory',
    entityId: id,
  })

  return territory
}
