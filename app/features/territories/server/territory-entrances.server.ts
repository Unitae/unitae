import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { ConflictError, ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface TakenEntrance {
  id: number
  /** « 3, 5 Rue des Lilas »: the building numbers and the street, as the editor shows them. */
  address: string
  territoryNumber: string
}

/** Some entrances are already on another territory of the same type: nothing is saved, and these are named. */
export class EntranceTakenError extends ConflictError {
  constructor(public readonly entrances: TakenEntrance[]) {
    super('entrance_taken')
  }
}

export interface ReassignmentInput {
  entranceId: number
  fromTerritoryId: number
}

export interface TerritoryEntrancesInput {
  entranceIds: number[]
  /** Entrances taken from another territory of the same type: they leave it first. */
  reassignments?: ReassignmentInput[]
}

interface Target {
  id: number
  type: TerritoryKindKey
}

/**
 * Gives a territory its entrances, for creation and edition alike. The reassigned entrances first leave their
 * territory (same congregation, same type, really holding them). Then an entrance the territory does not hold yet must
 * not be on another territory of its type: one taken in the meantime refuses the whole save. An entrance it already
 * holds stays, even when an older save left it on two territories of the type.
 */
export async function setTerritoryEntrances(
  db: TransactionClient,
  target: Target,
  input: TerritoryEntrancesInput,
  congregationId: number,
  actorId: number,
): Promise<void> {
  for (const reassignment of input.reassignments ?? []) {
    await reassign(db, target, reassignment, congregationId, actorId)
  }

  await assertNotTaken(db, target, input.entranceIds, congregationId)

  await db.territory.update({
    where: { id_congregationId: { id: target.id, congregationId } },
    data: { entrances: { set: input.entranceIds.map(id => ({ id })) } },
  })
}

async function reassign(
  db: TransactionClient,
  target: Target,
  { entranceId, fromTerritoryId }: ReassignmentInput,
  congregationId: number,
  actorId: number,
) {
  if (fromTerritoryId === target.id) {
    throw new ValidationError('reassignments', `Reassignment source must differ from target territory ${target.id}`)
  }

  const source = await db.territory.findUnique({
    where: { id_congregationId: { id: fromTerritoryId, congregationId } },
    select: { id: true, type: true },
  })
  if (source == null) {
    throw new ValidationError('reassignments', `Source territory not found: ${fromTerritoryId}`)
  }
  if (source.type !== target.type) {
    throw new ValidationError(
      'reassignments',
      `Source territory type ${source.type} differs from target ${target.type}`,
    )
  }

  const linked = await db.buildingEntrance.findFirst({
    where: { id: entranceId, congregationId, territories: { some: { id: source.id } } },
    select: { id: true },
  })
  if (linked == null) {
    throw new ValidationError('reassignments', `Entrance ${entranceId} is not linked to territory ${source.id}`)
  }

  await db.buildingEntrance.update({
    where: { id_congregationId: { id: entranceId, congregationId } },
    data: { territories: { disconnect: { id: source.id } } },
  })

  audit({
    action: AuditAction.EntranceReassigned,
    congregationId,
    actorId,
    entityType: 'BuildingEntrance',
    entityId: entranceId,
    metadata: { fromTerritoryId: source.id, toTerritoryId: target.id },
  })
}

async function assertNotTaken(db: TransactionClient, target: Target, entranceIds: number[], congregationId: number) {
  if (entranceIds.length === 0) return

  const others = { type: target.type, id: { not: target.id } }
  const taken = await db.buildingEntrance.findMany({
    where: { id: { in: entranceIds }, congregationId, territories: { none: { id: target.id }, some: others } },
    select: {
      id: true,
      buildings: { select: { number: true, street: true }, orderBy: { id: 'asc' } },
      territories: { where: others, select: { number: true }, orderBy: { id: 'asc' }, take: 1 },
    },
    orderBy: { id: 'asc' },
  })
  if (taken.length === 0) return

  throw new EntranceTakenError(
    taken.map(entrance => ({
      id: entrance.id,
      address:
        `${entrance.buildings.map(building => building.number).join(', ')} ${entrance.buildings[0]?.street ?? ''}`.trim(),
      territoryNumber: entrance.territories[0]?.number ?? '',
    })),
  )
}
