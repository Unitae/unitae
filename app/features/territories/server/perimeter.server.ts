import type { CardOverlayPath } from '~/features/territories/model/card-overlay'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

const PERIMETER_ENTITY_TYPE = 'TerritoryPerimeter'

export interface Perimeter {
  id: number
  paths: CardOverlayPath[]
}

export async function getPerimeter(db: TransactionClient): Promise<Perimeter | null> {
  const row = await db.territoryPerimeter.findFirst()
  if (row == null) return null
  return { id: row.id, paths: row.paths as CardOverlayPath[] }
}

export async function getPerimeterPaths(db: TransactionClient): Promise<CardOverlayPath[] | null> {
  const perimeter = await getPerimeter(db)
  return perimeter?.paths ?? null
}

export interface SetPerimeterParams {
  paths: CardOverlayPath[]
  congregationId: number
  actorId: number
}

export async function setPerimeter(db: TransactionClient, params: SetPerimeterParams): Promise<Perimeter> {
  const upserted = await db.territoryPerimeter.upsert({
    where: { congregationId: params.congregationId },
    create: { paths: params.paths, congregationId: params.congregationId },
    update: { paths: params.paths },
  })

  audit({
    action: AuditAction.PerimeterUpdated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: PERIMETER_ENTITY_TYPE,
    entityId: upserted.id,
  })

  return { id: upserted.id, paths: upserted.paths as CardOverlayPath[] }
}

export async function clearPerimeter(db: TransactionClient, congregationId: number, actorId: number): Promise<boolean> {
  const existing = await db.territoryPerimeter.findFirst()
  if (existing == null) return false

  await db.territoryPerimeter.delete({ where: { id_congregationId: { id: existing.id, congregationId } } })

  audit({
    action: AuditAction.PerimeterCleared,
    congregationId,
    actorId,
    entityType: PERIMETER_ENTITY_TYPE,
    entityId: existing.id,
  })

  return true
}
