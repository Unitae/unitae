import type { Prisma } from '~/database/generated/client'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface UpdateAttributionParams {
  publisherId: number
  notes: string
  type: TerritoryAttributionKind
  startDate: Date
  lateDate?: Date
  endDate?: Date
}

export async function updateAttribution(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateAttributionParams,
) {
  const updateData: Prisma.XOR<Prisma.AttributionUpdateInput, Prisma.AttributionUncheckedUpdateInput> = {
    publisherId: params.publisherId,
    notes: params.notes,
    type: params.type,
    startDate: params.startDate,
  }

  if (params.lateDate != null) {
    updateData.lateDate = params.lateDate
  }

  if (params.endDate != null) {
    updateData.endDate = params.endDate
  }

  const attribution = await db.attribution.update({
    where: {
      id_congregationId: { id, congregationId },
    },
    data: updateData,
  })

  audit({
    action: AuditAction.AttributionUpdated,
    congregationId,
    actorId,
    entityType: 'Attribution',
    entityId: id,
  })

  return attribution
}
