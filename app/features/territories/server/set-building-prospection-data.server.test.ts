import { beforeEach, describe, expect, it, vi } from 'vitest'

const SENTINEL_ENTRANCE = { id: 42, kind: 'residential' }

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    building: { update: vi.fn() },
    buildingEntrance: { update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    buildingResidentialData: { upsert: vi.fn(), aggregate: vi.fn(), deleteMany: vi.fn() },
    buildingAccess: { deleteMany: vi.fn(), create: vi.fn() },
  },
}))

const { setBuildingProspectionData } = await import('./set-building-prospection-data.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.building.update).mockResolvedValue({ id: 1, entrances: [SENTINEL_ENTRANCE] } as never)
  vi.mocked(db.buildingResidentialData.aggregate).mockResolvedValue({
    _sum: { homes: null, phones: null, liberals: null },
  } as never)
  vi.mocked(db.buildingEntrance.findMany).mockResolvedValue([] as never)
})

function makeFormData(entries: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value)
  }
  return fd
}

describe('setBuildingProspectionData', () => {
  it('parse la date de prospection', async () => {
    const formData = makeFormData({
      'has-residential': 'on',
      'prospection-date': '2025-04-08',
    })

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.prospectionDate).toBeInstanceOf(Date)
  })

  it('la date de prospection est null par défaut', async () => {
    const formData = makeFormData({ 'has-residential': 'on' })

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.prospectionDate).toBeNull()
  })

  it("met à jour l'entrée résidentielle avec les données d'accès", async () => {
    const formData = makeFormData({
      'has-residential': 'on',
      access: '3',
      pmr: 'on',
      doors: 'on',
      mailboxes: 'on',
    })

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.buildingEntrance.update).mock.calls[0][0]
    expect(callArgs.data.access).toBe(3)
    expect(callArgs.data.isPMR).toBe(true)
    expect(callArgs.data.isOpenEarly).toBe(true)
    expect(callArgs.data.isMailboxOpen).toBe(true)
  })

  it('upsert les données résidentielles (homes, phones, liberals)', async () => {
    const formData = makeFormData({
      'has-residential': 'on',
      homes: '15',
      phones: '3',
      liberals: '2',
    })

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.buildingResidentialData.upsert).mock.calls[0][0]
    expect(callArgs.update.homes).toBe(15)
    expect(callArgs.update.phones).toBe(3)
    expect(callArgs.update.liberals).toBe(2)
  })

  it('les données résidentielles sont null par défaut', async () => {
    const formData = makeFormData({ 'has-residential': 'on' })

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.buildingResidentialData.upsert).mock.calls[0][0]
    expect(callArgs.update.homes).toBeNull()
    expect(callArgs.update.phones).toBeNull()
    expect(callArgs.update.liberals).toBeNull()
  })

  it('crée une entrée commerce pour chaque shopkinds soumis', async () => {
    const formData = new FormData()
    formData.append('shopkinds', 'alimentaire')
    formData.append('shopkinds', 'coiffure-cosmetiques')

    await setBuildingProspectionData(db, 1, formData)

    expect(vi.mocked(db.buildingEntrance.create)).toHaveBeenCalledTimes(2)
  })
})
