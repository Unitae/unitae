import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    user: { count: vi.fn() },
    publisherActivity: { groupBy: vi.fn() },
  },
}))

const { getPublisherStats } = await import('./get-publisher-stats.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

function makeFigure(type: PublisherType, count: number, hours: number, studies: number) {
  return {
    type,
    _count: { _all: count },
    _sum: { hours, studies },
  } as never
}

describe('getPublisherStats', () => {
  it('agrège les statistiques par type de proclamateur', async () => {
    vi.mocked(db.user.count).mockResolvedValue(25)
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([
      makeFigure(PublisherType.Normal, 15, 0, 5),
      makeFigure(PublisherType.PionnierPermanant, 3, 210, 8),
      makeFigure(PublisherType.PionnierAuxiliaires, 7, 350, 3),
    ])

    const result = await getPublisherStats(db, 1, 3, 2025)

    // all: total
    expect(result.all.count).toBe(25)
    expect(result.all.active).toBe(15 + 3 + 7) // 25
    expect(result.all.hours).toBe(210 + 350) // 560 (heures seulement pour les pionniers)
    expect(result.all.studies).toBe(5 + 8 + 3) // 16

    // par type
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
    vi.mocked(db.user.count).mockResolvedValue(0)
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
    vi.mocked(db.user.count).mockResolvedValue(10)
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([makeFigure(PublisherType.Normal, 10, 0, 2)])

    const result = await getPublisherStats(db, 1, 6, 2025)

    expect(result.all.active).toBe(10)
    expect(result.all.hours).toBe(0) // pas de pionniers
    expect(result.permanentPionneer.count).toBe(0)
    expect(result.auxiliaryPionneer.count).toBe(0)
  })

  it('note: all.hours ne compte pas les heures des proclamateurs normaux', async () => {
    vi.mocked(db.user.count).mockResolvedValue(5)
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([
      makeFigure(PublisherType.Normal, 5, 100, 0), // 100 heures pour les normaux
      makeFigure(PublisherType.PionnierPermanant, 2, 50, 0),
    ])

    const result = await getPublisherStats(db, 1, 1, 2025)

    // all.hours n'inclut que les pionniers permanents et auxiliaires
    expect(result.all.hours).toBe(50)
    // mais publishers.hours contient bien les heures des normaux
    expect(result.publishers.hours).toBe(100)
  })
})
