import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType } from '~/shared/types/publisher-type'

export async function getPublisherStats(db: TransactionClient, congregationId: number, month: number, year: number) {
  const figures = await db.publisherActivity.groupBy({
    _count: { _all: true },
    _sum: { hours: true, studies: true },
    where: { year, month, congregationId },
    by: ['type', 'isPublisher'],
  })

  return {
    all: getAllStats(figures),
    publishers: getStatsByType(figures, PublisherType.Normal),
    permanentPionneer: getStatsByType(figures, PublisherType.PionnierPermanant),
    auxiliaryPionneer: getStatsByType(figures, PublisherType.PionnierAuxiliaires),
  }
}

type Figure = {
  type: PublisherType
  isPublisher: boolean
  _count: { _all: number }
  _sum: { hours: number | null; studies: number | null }
}

function getAllStats(figures: Figure[]) {
  const active = figures.filter(f => f.isPublisher)
  const isPioneer = (type: PublisherType) =>
    type === PublisherType.PionnierPermanant || type === PublisherType.PionnierAuxiliaires

  return {
    count: figures.reduce((sum, f) => sum + f._count._all, 0),
    active: active.reduce((sum, f) => sum + f._count._all, 0),
    hours: active.filter(f => isPioneer(f.type)).reduce((sum, f) => sum + (f._sum.hours ?? 0), 0),
    studies: active.reduce((sum, f) => sum + (f._sum.studies ?? 0), 0),
  }
}

function getStatsByType(figures: Figure[], type: PublisherType) {
  const row = figures.find(f => f.type === type && f.isPublisher)
  return {
    count: row?._count._all ?? 0,
    hours: row?._sum.hours ?? 0,
    studies: row?._sum.studies ?? 0,
  }
}
