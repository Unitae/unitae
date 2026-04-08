import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    setting: { findFirst: vi.fn() },
  },
}))

const { getProspectionStaleDate } = await import('./buildings')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 3, 8)) // 8 avril 2026
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('getProspectionStaleDate', () => {
  it('retourne epoch (1970) quand le setting n\'est pas configuré', async () => {
    vi.mocked(db.setting.findFirst).mockResolvedValue(null as never)

    const result = await getProspectionStaleDate()
    expect(result.getTime()).toBe(0)
  })

  it('retourne epoch quand la valeur est "0"', async () => {
    vi.mocked(db.setting.findFirst).mockResolvedValue({ id: 1, key: 'prospection-validity', value: '0' } as never)

    const result = await getProspectionStaleDate()
    expect(result.getTime()).toBe(0)
  })

  it('retourne une date dans le passé quand la valeur est positive', async () => {
    vi.mocked(db.setting.findFirst).mockResolvedValue({ id: 1, key: 'prospection-validity', value: '6' } as never)

    const result = await getProspectionStaleDate()
    // 8 avril 2026 - 6 mois = 8 octobre 2025
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(9) // octobre
  })

  it('ne considère jamais une date du jour comme périmée quand non configuré', async () => {
    vi.mocked(db.setting.findFirst).mockResolvedValue(null as never)

    const staleDate = await getProspectionStaleDate()
    const today = new Date(2026, 3, 8)

    // Une date d'aujourd'hui ne doit PAS être < staleDate
    expect(today < staleDate).toBe(false)
  })

  it('considère une date ancienne comme périmée quand configuré à 6 mois', async () => {
    vi.mocked(db.setting.findFirst).mockResolvedValue({ id: 1, key: 'prospection-validity', value: '6' } as never)

    const staleDate = await getProspectionStaleDate()
    const sevenMonthsAgo = new Date(2025, 8, 1) // 1er septembre 2025

    expect(sevenMonthsAgo < staleDate).toBe(true)
  })

  it('ne considère pas une date récente comme périmée quand configuré à 6 mois', async () => {
    vi.mocked(db.setting.findFirst).mockResolvedValue({ id: 1, key: 'prospection-validity', value: '6' } as never)

    const staleDate = await getProspectionStaleDate()
    const twoMonthsAgo = new Date(2026, 1, 8) // 8 février 2026

    expect(twoMonthsAgo < staleDate).toBe(false)
  })
})
