import type { TransactionClient } from '~/shared/infra/db.server'

export interface CreatePublisherActivityParams {
  publisherId: number
  month: number
  year: number
  type: string
  isPublisher: boolean
  hours: number
  studies: number
  notes: string
  congregationId: number
}

export function createPublisherActivity(db: TransactionClient, params: CreatePublisherActivityParams) {
  return db.publisherActivity.create({
    data: {
      publisherId: params.publisherId,
      month: params.month,
      year: params.year,
      type: params.type,
      isPublisher: params.isPublisher,
      hours: params.hours,
      studies: params.studies,
      notes: params.notes,
      congregationId: params.congregationId,
    },
  })
}

export interface UpdatePublisherActivityParams {
  type: string
  isPublisher: boolean
  hours: number
  studies: number
  notes: string
}

export function updatePublisherActivity(
  db: TransactionClient,
  id: number,
  congregationId: number,
  params: UpdatePublisherActivityParams,
) {
  return db.publisherActivity.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
      id_congregationId: { id, congregationId },
    },
    data: {
      type: params.type,
      isPublisher: params.isPublisher,
      hours: params.hours,
      studies: params.studies,
      notes: params.notes,
    },
  })
}

export function deletePublisherActivity(db: TransactionClient, id: number, congregationId: number) {
  return db.publisherActivity.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
      id_congregationId: { id, congregationId },
    },
    include: { publisher: true },
  })
}
