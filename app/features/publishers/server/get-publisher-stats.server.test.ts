import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    publisherActivity: { groupBy: vi.fn() },
  },
}))

const { getPublisherStats } = await import('./get-publisher-stats.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

function makeFigure(type: PublisherType, isPublisher: boolean, count: number, hours: number, studies: number) {
  return {
    type,
    isPublisher,
    _count: { _all: count },
    _sum: { hours, studies },
  } as never
}

describe('getPublisherStats', () => {
  it('agrège les statistiques par type de proclamateur', async () => {
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([
      makeFigure(PublisherType.Normal, true, 15, 0, 5),
      makeFigure(PublisherType.PionnierPermanant, true, 3, 210, 8),
      makeFigure(PublisherType.PionnierAuxiliaires, true, 7, 350, 3),
    ])

    const result = await getPublisherStats(db, 1, 3, 2025)

    expect(result.all.count).toBe(25)
    expect(result.all.active).toBe(15 + 3 + 7)
    expect(result.all.hours).toBe(210 + 350)
    expect(result.all.studies).toBe(5 + 8 + 3)

    expect(result.publishers.count).toBe(15)
    expect(result.publishers.hours).toBe(0)
    expect(result.publishers.studies).toBe(5)

    expect(result.permanentPionneer.count).toBe(3)
    expect(result.permanentPionneer.hours).toBe(210)
    expect(result.permanentPionneer.studies).toBe(8)

    expect(result.auxiliaryPionneer.count).toBe(7)
    expect(result.auxiliaryPionneer.hours).toBe(350)
    expect(result.auxiliaryPionneer.studies).toBe(3)
  })

  it('gère le cas sans activité (données vides)', async () => {
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([])

    const result = await getPublisherStats(db, 1, 1, 2025)

    expect(result.all.count).toBe(0)
    expect(result.all.active).toBe(0)
    expect(result.all.hours).toBe(0)
    expect(result.all.studies).toBe(0)

    expect(result.publishers.count).toBe(0)
    expect(result.permanentPionneer.count).toBe(0)
    expect(result.auxiliaryPionneer.count).toBe(0)
  })

  it('gère le cas où seuls certains types ont des activités', async () => {
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([makeFigure(PublisherType.Normal, true, 10, 0, 2)])

    const result = await getPublisherStats(db, 1, 6, 2025)

    expect(result.all.active).toBe(10)
    expect(result.all.hours).toBe(0)
    expect(result.permanentPionneer.count).toBe(0)
    expect(result.auxiliaryPionneer.count).toBe(0)
  })

  it('all.hours ne compte pas les heures des proclamateurs normaux', async () => {
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([
      makeFigure(PublisherType.Normal, true, 5, 100, 0),
      makeFigure(PublisherType.PionnierPermanant, true, 2, 50, 0),
    ])

    const result = await getPublisherStats(db, 1, 1, 2025)

    expect(result.all.hours).toBe(50)
    expect(result.publishers.hours).toBe(100)
  })

  it('compte les proclamateurs irréguliers dans all.count mais pas dans all.active', async () => {
    // Regression: with the previous implementation, `count` was based on
    // Member with leftAt/inactiveAt = null while `active` was based on
    // PublisherActivity without any member-state filter. When a member marked
    // inactive today had reported a regular activity for the queried month,
    // `count` dropped but `active` didn't — cancelling out real irregulars.
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([
      makeFigure(PublisherType.Normal, true, 20, 0, 5),
      makeFigure(PublisherType.Normal, false, 2, 0, 0),
      makeFigure(PublisherType.PionnierPermanant, true, 3, 210, 8),
    ])

    const result = await getPublisherStats(db, 1, 3, 2025)

    expect(result.all.count).toBe(25)
    expect(result.all.active).toBe(23)
    expect(result.all.count - result.all.active).toBe(2)
  })

  it('per-type counts ignorent les activités irrégulières', async () => {
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([
      makeFigure(PublisherType.Normal, true, 10, 0, 4),
      makeFigure(PublisherType.Normal, false, 3, 0, 0),
    ])

    const result = await getPublisherStats(db, 1, 3, 2025)

    expect(result.publishers.count).toBe(10)
    expect(result.publishers.studies).toBe(4)
  })
})
