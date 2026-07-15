import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType } from '~/shared/types/publisher-type'

export async function getPublisherStats(db: TransactionClient, congregationId: number, month: number, year: number) {
  const [figures, irregular] = await Promise.all([
    db.publisherActivity.groupBy({
      _count: { _all: true },
      _sum: { hours: true, studies: true },
      where: { year, month, congregationId },
      by: ['type', 'isPublisher'],
    }),
    countIrregular(db, congregationId, month, year),
  ])

  return {
    all: getAllStats(figures, irregular),
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

function getAllStats(figures: Figure[], irregular: number) {
  const active = figures.filter(f => f.isPublisher)
  const isPioneer = (type: PublisherType) =>
    type === PublisherType.PionnierPermanant || type === PublisherType.PionnierAuxiliaires

  return {
    count: figures.reduce((sum, f) => sum + f._count._all, 0),
    active: active.reduce((sum, f) => sum + f._count._all, 0),
    irregular,
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

/**
 * Counts missed-preach reports (isPublisher=false) for the queried month, excluding
 * publishers who were already flagged inactive as of that month. Mirrors the
 * table's `wasInactiveDuring` check so the header widget stays consistent with
 * the per-row badges: an inactive publisher who filed a missed report is
 * displayed as `inactive` in the table, not `irregular`, and shouldn't be
 * double-counted here either.
 *
 * `inactiveAt` is stamped at the first of the month AFTER the streak completed
 * (see `evaluate-inactive-status.server.ts`), so "not inactive during the
 * queried month" reduces to `inactiveAt IS NULL OR inactiveAt >= firstOfNextMonth`.
 */
function countIrregular(db: TransactionClient, congregationId: number, month: number, year: number): Promise<number> {
  const firstOfNextMonth = new Date(year, month + 1, 1)
  return db.publisherActivity.count({
    where: {
      year,
      month,
      congregationId,
      isPublisher: false,
      publisher: {
        OR: [{ inactiveAt: null }, { inactiveAt: { gte: firstOfNextMonth } }],
      },
    },
  })
}
