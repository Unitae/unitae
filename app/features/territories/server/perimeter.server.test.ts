import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territoryPerimeter: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock('~/shared/domain/audit.server', async () => {
  const actual = await vi.importActual<typeof import('~/shared/domain/audit.server')>('~/shared/domain/audit.server')
  return { ...actual, audit: vi.fn() }
})

const { clearPerimeter, getPerimeter, getPerimeterPaths, setPerimeter } = await import('./perimeter.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { audit, AuditAction } = await import('~/shared/domain/audit.server')

beforeEach(() => {
  vi.resetAllMocks()
})

const SAMPLE_PATHS = [
  { lat: 45.75, lng: 4.83 },
  { lat: 45.76, lng: 4.84 },
  { lat: 45.77, lng: 4.85 },
  { lat: 45.75, lng: 4.83 },
]

describe('getPerimeter', () => {
  it('retourne null quand aucun périmètre', async () => {
    vi.mocked(db.territoryPerimeter.findFirst).mockResolvedValue(null)
    expect(await getPerimeter(db as never)).toBeNull()
  })

  it('retourne le périmètre typé quand présent', async () => {
    vi.mocked(db.territoryPerimeter.findFirst).mockResolvedValue({ id: 7, paths: SAMPLE_PATHS } as never)
    const perimeter = await getPerimeter(db as never)
    expect(perimeter).toMatchObject({ id: 7, paths: SAMPLE_PATHS })
  })
})

describe('getPerimeterPaths', () => {
  it('retourne null quand aucun périmètre', async () => {
    vi.mocked(db.territoryPerimeter.findFirst).mockResolvedValue(null)
    expect(await getPerimeterPaths(db as never)).toBeNull()
  })

  it('retourne les sommets seuls', async () => {
    vi.mocked(db.territoryPerimeter.findFirst).mockResolvedValue({ id: 7, paths: SAMPLE_PATHS } as never)
    expect(await getPerimeterPaths(db as never)).toEqual(SAMPLE_PATHS)
  })
})

describe('setPerimeter', () => {
  it('upsert et journalise', async () => {
    vi.mocked(db.territoryPerimeter.upsert).mockResolvedValue({ id: 12, paths: SAMPLE_PATHS } as never)

    const result = await setPerimeter(db as never, {
      paths: SAMPLE_PATHS,
      congregationId: 3,
      actorId: 99,
    })

    expect(result).toMatchObject({ id: 12, paths: SAMPLE_PATHS })
    expect(db.territoryPerimeter.upsert).toHaveBeenCalledWith({
      where: { congregationId: 3 },
      create: { paths: SAMPLE_PATHS, congregationId: 3 },
      update: { paths: SAMPLE_PATHS },
    })
    expect(audit).toHaveBeenCalledWith({
      action: AuditAction.PerimeterUpdated,
      congregationId: 3,
      actorId: 99,
      entityType: 'TerritoryPerimeter',
      entityId: 12,
    })
  })
})

describe('clearPerimeter', () => {
  it("retourne false quand aucun périmètre n'existe", async () => {
    vi.mocked(db.territoryPerimeter.findFirst).mockResolvedValue(null)

    const result = await clearPerimeter(db as never, 3, 99)

    expect(result).toBe(false)
    expect(db.territoryPerimeter.delete).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('supprime, retourne true et journalise', async () => {
    vi.mocked(db.territoryPerimeter.findFirst).mockResolvedValue({ id: 8, paths: SAMPLE_PATHS } as never)

    const result = await clearPerimeter(db as never, 3, 99)

    expect(result).toBe(true)
    expect(db.territoryPerimeter.delete).toHaveBeenCalledWith({ where: { id: 8 } })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.PerimeterCleared, entityId: 8 }),
    )
  })
})
