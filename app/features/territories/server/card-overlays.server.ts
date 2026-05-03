import type { CardOverlay, CardOverlayPath } from '~/features/territories/model/card-overlay'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

const CARD_OVERLAY_ENTITY_TYPE = 'TerritoryCardOverlay'

interface RawOverlay {
  id: number
  name: string | null
  color: string
  paths: unknown
}

function toCardOverlay(row: RawOverlay): CardOverlay {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    paths: row.paths as CardOverlayPath[],
  }
}

export async function listCardOverlays(db: TransactionClient): Promise<CardOverlay[]> {
  const rows = await db.territoryCardOverlay.findMany({ orderBy: [{ createdAt: 'asc' }] })
  return rows.map(toCardOverlay)
}

export async function getCardOverlay(db: TransactionClient, id: number): Promise<CardOverlay | null> {
  const row = await db.territoryCardOverlay.findFirst({ where: { id } })
  return row == null ? null : toCardOverlay(row)
}

export interface CreateCardOverlayParams {
  name: string | null
  color: string
  paths: CardOverlayPath[]
  congregationId: number
  actorId: number
}

export async function createCardOverlay(db: TransactionClient, params: CreateCardOverlayParams): Promise<CardOverlay> {
  const created = await db.territoryCardOverlay.create({
    data: {
      name: params.name,
      color: params.color,
      paths: params.paths,
      congregationId: params.congregationId,
    },
  })

  audit({
    action: AuditAction.CardOverlayCreated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: CARD_OVERLAY_ENTITY_TYPE,
    entityId: created.id,
  })

  return toCardOverlay(created)
}

export interface UpdateCardOverlayParams {
  name?: string | null
  color?: string
  paths?: CardOverlayPath[]
  congregationId: number
  actorId: number
}

export async function updateCardOverlay(
  db: TransactionClient,
  id: number,
  params: UpdateCardOverlayParams,
): Promise<CardOverlay | null> {
  const existing = await db.territoryCardOverlay.findFirst({ where: { id } })
  if (existing == null) return null

  const updated = await db.territoryCardOverlay.update({
    where: { id },
    data: {
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.color !== undefined ? { color: params.color } : {}),
      ...(params.paths !== undefined ? { paths: params.paths } : {}),
    },
  })

  audit({
    action: AuditAction.CardOverlayUpdated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: CARD_OVERLAY_ENTITY_TYPE,
    entityId: id,
  })

  return toCardOverlay(updated)
}

export async function deleteCardOverlay(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
): Promise<CardOverlay | null> {
  const existing = await db.territoryCardOverlay.findFirst({ where: { id } })
  if (existing == null) return null

  await db.territoryCardOverlay.delete({ where: { id } })

  audit({
    action: AuditAction.CardOverlayDeleted,
    congregationId,
    actorId,
    entityType: CARD_OVERLAY_ENTITY_TYPE,
    entityId: id,
  })

  return toCardOverlay(existing)
}
