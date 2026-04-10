import type { ScopedDb } from '~/shared/libs/db.server'
import { PublisherType } from '~/shared/types/publisher-type'

export async function getPublisherStats(db: ScopedDb, month: number, year: number) {
  const publishers = await db.user.count({
    where: {
      activities: {
        some: {
          year,
          month,
        },
      },
    },
  })
  const figureMap = await getFiguresMap(db, month, year)

  return {
    all: getAllStats(publishers, figureMap),
    publishers: getStatsByType(figureMap, PublisherType.Normal),
    permanentPionneer: getStatsByType(figureMap, PublisherType.PionnierPermanant),
    auxiliaryPionneer: getStatsByType(figureMap, PublisherType.PionnierAuxiliaires),
  }
}

async function getFiguresMap(db: ScopedDb, month: number, year: number) {
  const figures = await db.publisherActivity.groupBy({
    _count: {
      _all: true,
    },
    _sum: {
      hours: true,
      studies: true,
    },
    where: {
      year,
      month,
      isPublisher: true,
    },
    by: 'type',
  })

  return figures.reduce((aggr, curr) => {
    return Object.assign(aggr, { [curr.type]: curr })
  }, {}) as {
    [Key in PublisherType]: {
      _count: { _all: number }
      _sum: { hours: number; studies: number }
    }
  }
}

function getAllStats(
  publishers: number,
  figureMap: {
    [Key in PublisherType]: {
      _count: { _all: number }
      _sum: { hours: number; studies: number }
    }
  },
) {
  return {
    count: publishers,
    active:
      (figureMap[PublisherType.Normal]?._count._all ?? 0) +
      (figureMap[PublisherType.PionnierPermanant]?._count._all ?? 0) +
      (figureMap[PublisherType.PionnierAuxiliaires]?._count._all ?? 0),
    hours:
      (figureMap[PublisherType.PionnierPermanant]?._sum.hours ?? 0) +
      (figureMap[PublisherType.PionnierAuxiliaires]?._sum.hours ?? 0),
    studies:
      (figureMap[PublisherType.Normal]?._sum.studies ?? 0) +
      (figureMap[PublisherType.PionnierPermanant]?._sum.studies ?? 0) +
      (figureMap[PublisherType.PionnierAuxiliaires]?._sum.studies ?? 0),
  }
}

function getStatsByType(
  figureMap: {
    [Key in PublisherType]: {
      _count: { _all: number }
      _sum: { hours: number; studies: number }
    }
  },
  type: PublisherType,
) {
  return {
    count: figureMap[type]?._count._all ?? 0,
    hours: figureMap[type]?._sum.hours ?? 0,
    studies: figureMap[type]?._sum.studies ?? 0,
  }
}
