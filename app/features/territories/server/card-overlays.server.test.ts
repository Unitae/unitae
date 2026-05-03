import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territoryCardOverlay: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock('~/shared/domain/audit.server', async () => {
  const actual = await vi.importActual<typeof import('~/shared/domain/audit.server')>('~/shared/domain/audit.server')
  return { ...actual, audit: vi.fn() }
})

const { createCardOverlay, deleteCardOverlay, getCardOverlay, listCardOverlays, updateCardOverlay } = await import(
  './card-overlays.server'
)
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

describe('listCardOverlays', () => {
  it('retourne les overlays triés par date de création', async () => {
    vi.mocked(db.territoryCardOverlay.findMany).mockResolvedValue([
      { id: 1, name: 'Z1', color: '#111111', paths: SAMPLE_PATHS },
      { id: 2, name: null, color: '#222222', paths: SAMPLE_PATHS },
    ] as never)

    const result = await listCardOverlays(db as never)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 1, name: 'Z1', color: '#111111' })
    expect(db.territoryCardOverlay.findMany).toHaveBeenCalledWith({ orderBy: [{ createdAt: 'asc' }] })
  })
})

describe('getCardOverlay', () => {
  it('retourne null quand absent', async () => {
    vi.mocked(db.territoryCardOverlay.findFirst).mockResolvedValue(null)
    expect(await getCardOverlay(db as never, 999)).toBeNull()
  })

  it('retourne un overlay typé quand présent', async () => {
    vi.mocked(db.territoryCardOverlay.findFirst).mockResolvedValue({
      id: 5,
      name: 'Centre',
      color: '#C2175B',
      paths: SAMPLE_PATHS,
    } as never)
    const result = await getCardOverlay(db as never, 5)
    expect(result).toMatchObject({ id: 5, name: 'Centre' })
  })
})

describe('createCardOverlay', () => {
  it('crée et journalise un overlay', async () => {
    vi.mocked(db.territoryCardOverlay.create).mockResolvedValue({
      id: 42,
      name: 'Nouvelle',
      color: '#0E9A6C',
      paths: SAMPLE_PATHS,
    } as never)

    const result = await createCardOverlay(db as never, {
      name: 'Nouvelle',
      color: '#0E9A6C',
      paths: SAMPLE_PATHS,
      congregationId: 1,
      actorId: 7,
    })

    expect(result).toMatchObject({ id: 42, name: 'Nouvelle' })
    expect(db.territoryCardOverlay.create).toHaveBeenCalledWith({
      data: { name: 'Nouvelle', color: '#0E9A6C', paths: SAMPLE_PATHS, congregationId: 1 },
    })
    expect(audit).toHaveBeenCalledWith({
      action: AuditAction.CardOverlayCreated,
      congregationId: 1,
      actorId: 7,
      entityType: 'TerritoryCardOverlay',
      entityId: 42,
    })
  })
})

describe('updateCardOverlay', () => {
  it('retourne null quand l’overlay n’existe pas', async () => {
    vi.mocked(db.territoryCardOverlay.findFirst).mockResolvedValue(null)
    const result = await updateCardOverlay(db as never, 999, {
      color: '#000000',
      congregationId: 1,
      actorId: 7,
    })
    expect(result).toBeNull()
    expect(db.territoryCardOverlay.update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it("accepte un nouveau jeu de sommets quand l'on modifie la forme", async () => {
    vi.mocked(db.territoryCardOverlay.findFirst).mockResolvedValue({
      id: 4,
      name: 'Avant',
      color: '#111111',
      paths: SAMPLE_PATHS,
    } as never)
    vi.mocked(db.territoryCardOverlay.update).mockResolvedValue({
      id: 4,
      name: 'Avant',
      color: '#111111',
      paths: [...SAMPLE_PATHS, { lat: 45.78, lng: 4.86 }],
    } as never)

    const newPaths = [...SAMPLE_PATHS.slice(0, 3), { lat: 45.78, lng: 4.86 }, SAMPLE_PATHS[0]]
    await updateCardOverlay(db as never, 4, {
      paths: newPaths,
      congregationId: 1,
      actorId: 9,
    })

    expect(db.territoryCardOverlay.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { paths: newPaths },
    })
  })

  it('met à jour seulement les champs fournis et journalise', async () => {
    vi.mocked(db.territoryCardOverlay.findFirst).mockResolvedValue({
      id: 3,
      name: 'Old',
      color: '#111111',
      paths: SAMPLE_PATHS,
    } as never)
    vi.mocked(db.territoryCardOverlay.update).mockResolvedValue({
      id: 3,
      name: 'Old',
      color: '#222222',
      paths: SAMPLE_PATHS,
    } as never)

    const result = await updateCardOverlay(db as never, 3, {
      color: '#222222',
      congregationId: 1,
      actorId: 9,
    })

    expect(result).toMatchObject({ id: 3, color: '#222222' })
    expect(db.territoryCardOverlay.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { color: '#222222' },
    })
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: AuditAction.CardOverlayUpdated, entityId: 3 }))
  })
})

describe('deleteCardOverlay', () => {
  it('retourne null quand l’overlay n’existe pas', async () => {
    vi.mocked(db.territoryCardOverlay.findFirst).mockResolvedValue(null)
    const result = await deleteCardOverlay(db as never, 999, 1, 7)
    expect(result).toBeNull()
    expect(db.territoryCardOverlay.delete).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('supprime, retourne l’ancien overlay et journalise', async () => {
    vi.mocked(db.territoryCardOverlay.findFirst).mockResolvedValue({
      id: 8,
      name: 'À supprimer',
      color: '#111111',
      paths: SAMPLE_PATHS,
    } as never)

    const result = await deleteCardOverlay(db as never, 8, 1, 9)

    expect(result).toMatchObject({ id: 8, name: 'À supprimer' })
    expect(db.territoryCardOverlay.delete).toHaveBeenCalledWith({ where: { id: 8 } })
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: AuditAction.CardOverlayDeleted, entityId: 8 }))
  })
})
