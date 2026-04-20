import type { TransactionClient } from '~/shared/infra/db.server'

export interface CreateAttributionParams {
  publisherId: number
  territoryId: number
  startDate: string
  notes: string
  type: string
  congregationId: number
}

export async function createAttribution(db: TransactionClient, params: CreateAttributionParams) {
  const lateDate = new Date(params.startDate)
  lateDate.setMonth(lateDate.getMonth() + 4)

  return db.attribution.create({
    data: {
      publisherId: params.publisherId,
      territoryId: params.territoryId,
      notes: params.notes,
      type: params.type,
      startDate: new Date(params.startDate),
      lateDate,
      congregationId: params.congregationId,
    },
  })
}
