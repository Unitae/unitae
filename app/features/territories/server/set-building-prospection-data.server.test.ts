import { beforeEach, describe, expect, it, vi } from 'vitest'

const SENTINEL_ENTRANCE = { id: 42, kind: 'residential' }

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    building: { update: vi.fn() },
    buildingEntrance: { update: vi.fn() },
    buildingResidentialData: { upsert: vi.fn(), aggregate: vi.fn() },
    buildingAccess: { deleteMany: vi.fn(), create: vi.fn() },
  },
}))

const { setBuildingProspectionData } = await import('./set-building-prospection-data.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.building.update).mockResolvedValue({ id: 1, entrances: [SENTINEL_ENTRANCE] } as never)
  vi.mocked(db.buildingResidentialData.aggregate).mockResolvedValue({ _sum: { homes: null, phones: null, liberals: null } } as never)
})

function makeFormData(entries: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value)
  }
  return fd
}

describe('setBuildingProspectionData', () => {
  it('parse les champs numériques du formulaire', async () => {
    const formData = makeFormData({
      homes: '15',
      phones: '3',
      liberals: '2',
    })

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.homes).toBe(15)
    expect(callArgs.data.phones).toBe(3)
    expect(callArgs.data.liberals).toBe(2)
  })

  it('retourne null pour les champs numériques vides', async () => {
    const formData = makeFormData({})

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.homes).toBeNull()
    expect(callArgs.data.phones).toBeNull()
    expect(callArgs.data.liberals).toBeNull()
  })

  it('parse les champs booléens', async () => {
    const formData = makeFormData({
      shops: 'on',
      campus: 'on',
      hotel: 'on',
      landromat: 'on',
    })

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.hasShops).toBe(true)
    expect(callArgs.data.hasCampus).toBe(true)
    expect(callArgs.data.hasHotel).toBe(true)
    expect(callArgs.data.hasLandromat).toBe(true)
  })

  it('les champs booléens sont false par défaut', async () => {
    const formData = makeFormData({})

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.hasShops).toBe(false)
    expect(callArgs.data.hasCampus).toBe(false)
    expect(callArgs.data.hasHotel).toBe(false)
    expect(callArgs.data.hasLandromat).toBe(false)
  })

  it('parse le shopKind', async () => {
    const formData = makeFormData({
      shopkinds: 'boulangerie',
    })

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.shopKind).toBe('boulangerie')
  })

  it('shopKind est une chaîne vide par défaut', async () => {
    const formData = makeFormData({})

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.shopKind).toBe('')
  })

  it('parse la date de prospection', async () => {
    const formData = makeFormData({
      'prospection-date': '2025-04-08',
    })

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.prospectionDate).toBeInstanceOf(Date)
  })

  it('la date de prospection est null par défaut', async () => {
    const formData = makeFormData({})

    await setBuildingProspectionData(db, 1, formData)

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.prospectionDate).toBeNull()
  })

  it("met à jour l'entrée résidentielle avec les données d'accès", async () => {
    const formData = makeFormData({
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
})
