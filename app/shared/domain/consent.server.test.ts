import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    consentRecord: { create: vi.fn() },
  },
}))

const { recordConsentUnscoped, withdrawConsent, getActiveConsents, ConsentPurpose, CONSENT_VERSION } = await import(
  './consent.server'
)
const { unscopedDb } = await import('~/shared/infra/db.server')

const mockScopedDb = {
  consentRecord: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('recordConsentUnscoped', () => {
  it('cree un enregistrement de consentement avec la version courante', async () => {
    const fakeRecord = { id: 1, purpose: 'DATA_PROCESSING', consentVersion: CONSENT_VERSION }
    vi.mocked(unscopedDb.consentRecord.create).mockResolvedValue(fakeRecord as never)

    const result = await recordConsentUnscoped(1, 10, ConsentPurpose.DataProcessing, '127.0.0.1')

    expect(result).toEqual(fakeRecord)
    expect(unscopedDb.consentRecord.create).toHaveBeenCalledWith({
      data: {
        userId: 1,
        congregationId: 10,
        purpose: 'DATA_PROCESSING',
        consentVersion: CONSENT_VERSION,
        ipAddress: '127.0.0.1',
      },
    })
  })
})

describe('withdrawConsent', () => {
  it('marque le consentement actif comme retire', async () => {
    mockScopedDb.consentRecord.findFirst.mockResolvedValue({ id: 5, congregationId: 3 } as never)
    mockScopedDb.consentRecord.update.mockResolvedValue({ id: 5, withdrawnAt: new Date() } as never)

    const result = await withdrawConsent(mockScopedDb as never, 1, ConsentPurpose.DataProcessing)

    expect(result).toBeDefined()
    expect(mockScopedDb.consentRecord.update).toHaveBeenCalledWith({
      where: { id_congregationId: { id: 5, congregationId: 3 } },
      data: { withdrawnAt: expect.any(Date) },
    })
  })

  it('retourne null si aucun consentement actif', async () => {
    mockScopedDb.consentRecord.findFirst.mockResolvedValue(null as never)

    const result = await withdrawConsent(mockScopedDb as never, 1, ConsentPurpose.DataProcessing)

    expect(result).toBeNull()
    expect(mockScopedDb.consentRecord.update).not.toHaveBeenCalled()
  })
})

describe('getActiveConsents', () => {
  it('retourne les consentements non retires', async () => {
    const fakeConsents = [{ id: 1, purpose: 'DATA_PROCESSING', withdrawnAt: null }]
    mockScopedDb.consentRecord.findMany.mockResolvedValue(fakeConsents as never)

    const result = await getActiveConsents(mockScopedDb as never, 1)

    expect(result).toEqual(fakeConsents)
  })
})
