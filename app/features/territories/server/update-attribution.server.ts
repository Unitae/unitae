import type { Prisma } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/libs/db.server'

export interface UpdateAttributionParams {
  publisherId: number
  notes: string
  type: string
  startDate: Date
  lateDate?: Date
  endDate?: Date
}

export async function updateAttribution(
  db: TransactionClient,
  id: number,
  congregationId: number,
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

  return db.attribution.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound key
      id_congregationId: { id, congregationId },
    },
    data: updateData,
  })
}
