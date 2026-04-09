import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    territory: { findMany: vi.fn() },
  },
}))

vi.mock('./theocratic-year.server', () => ({
  getBeginingDateOfTheocraticYear: vi.fn(),
  getEndDateOfTheocraticYear: vi.fn(),
}))

const { getTerritoriesExportData } = await import('./territories-export-data.server')
const { db } = await import('~/shared/libs/db.server')
const { getBeginingDateOfTheocraticYear, getEndDateOfTheocraticYear } = await import('./theocratic-year.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getBeginingDateOfTheocraticYear).mockReturnValue(new Date(2025, 8, 1) as never)
  vi.mocked(getEndDateOfTheocraticYear).mockReturnValue(new Date(2026, 7, 31) as never)
  vi.mocked(db.territory.findMany).mockResolvedValue([] as never)
})

describe('getTerritoriesExportData', () => {
  it('retourne les territoires avec leurs attributions', async () => {
    const fakeTerritories = [{ id: 1, attributions: [] }]
    vi.mocked(db.territory.findMany).mockResolvedValue(fakeTerritories as never)

    const result = await getTerritoriesExportData(2025)
    expect(result).toEqual(fakeTerritories)
  })

  it("retourne un tableau vide quand il n'y a pas de territoires", async () => {
    const result = await getTerritoriesExportData(2025)
    expect(result).toEqual([])
  })

  it("passe l'année théocratique aux fonctions de date", async () => {
    await getTerritoriesExportData(2024)

    // Vérifier que les fonctions de date ont été utilisées (via le résultat)
    expect(vi.mocked(getBeginingDateOfTheocraticYear).mock.calls[0][0]).toBe(2024)
    expect(vi.mocked(getEndDateOfTheocraticYear).mock.calls[0][0]).toBe(2024)
  })

  it('inclut les attributions anciennes encore actives (sans date de fin)', async () => {
    await getTerritoriesExportData(2025)

    const call = vi.mocked(db.territory.findMany).mock.calls[0][0] as Record<string, unknown>
    const attrWhere = (call.include as { attributions: { where: Record<string, unknown> } }).attributions.where
    const orConditions = attrWhere.OR as Record<string, unknown>[]

    // La 4e condition attrape les attributions démarrées avant l'année précédente et toujours ouvertes
    expect(orConditions).toHaveLength(4)
    expect(orConditions[3]).toEqual({
      startDate: { lt: new Date(2024, 8, 1) },
      endDate: null,
    })
  })
})
