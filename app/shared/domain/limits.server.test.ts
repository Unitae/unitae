import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LimitError, LimitService } from './limits.server'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    member: { count: vi.fn() },
    userAccount: { count: vi.fn() },
    territory: { count: vi.fn() },
    boardDocument: { count: vi.fn() },
    territoryCardOverlay: { count: vi.fn() },
  },
}))

const { unscopedDb: db } = await import('~/shared/infra/db.server')

function makeLimits(overrides: Partial<ConstructorParameters<typeof LimitService>[1]> = {}) {
  return {
    maxPublishers: null,
    maxTerritories: null,
    maxUsers: null,
    maxStorageBytes: null,
    maxBoardDocuments: null,
    maxCardOverlays: null,
    ...overrides,
  }
}

describe('LimitService', () => {
  describe('isLimited', () => {
    it('retourne false quand la limite est null (illimité)', () => {
      const service = new LimitService(db as never, makeLimits({ maxPublishers: null }))
      expect(service.isLimited('members')).toBe(false)
    })

    it('retourne true quand la limite est définie', () => {
      const service = new LimitService(db as never, makeLimits({ maxPublishers: 10 }))
      expect(service.isLimited('members')).toBe(true)
    })

    it('retourne true même quand la limite est 0', () => {
      const service = new LimitService(db as never, makeLimits({ maxTerritories: 0 }))
      expect(service.isLimited('territories')).toBe(true)
    })

    it('vérifie chaque type de limite indépendamment', () => {
      const service = new LimitService(db as never, makeLimits({ maxPublishers: 10, maxTerritories: null }))
      expect(service.isLimited('members')).toBe(true)
      expect(service.isLimited('territories')).toBe(false)
    })
  })

  describe('isStorageLimited', () => {
    it('retourne false quand maxStorageBytes est null', () => {
      const service = new LimitService(db as never, makeLimits({ maxStorageBytes: null }))
      expect(service.isStorageLimited()).toBe(false)
    })

    it('retourne true quand maxStorageBytes est défini', () => {
      const service = new LimitService(db as never, makeLimits({ maxStorageBytes: 1000n }))
      expect(service.isStorageLimited()).toBe(true)
    })
  })

  describe('checkStorageLimit', () => {
    it("retourne false quand le stockage n'est pas limité", () => {
      const service = new LimitService(db as never, makeLimits({ maxStorageBytes: null }))
      expect(service.checkStorageLimit(500n, 100n)).toBe(false)
    })

    it('retourne false quand le total est sous la limite', () => {
      const service = new LimitService(db as never, makeLimits({ maxStorageBytes: 1000n }))
      expect(service.checkStorageLimit(500n, 100n)).toBe(false)
    })

    it('retourne false quand le total est exactement à la limite', () => {
      const service = new LimitService(db as never, makeLimits({ maxStorageBytes: 1000n }))
      expect(service.checkStorageLimit(500n, 500n)).toBe(false)
    })

    it('retourne true quand le total dépasse la limite', () => {
      const service = new LimitService(db as never, makeLimits({ maxStorageBytes: 1000n }))
      expect(service.checkStorageLimit(500n, 501n)).toBe(true)
    })
  })

  describe('errorIfStorageOverLimit', () => {
    it("ne lance pas d'erreur quand sous la limite", () => {
      const service = new LimitService(db as never, makeLimits({ maxStorageBytes: 1000n }))
      expect(() => service.errorIfStorageOverLimit(100n, 100n)).not.toThrow()
    })

    it('lance LimitError quand la limite est dépassée', () => {
      const service = new LimitService(db as never, makeLimits({ maxStorageBytes: 1000n }))
      try {
        service.errorIfStorageOverLimit(900n, 200n)
        expect.unreachable('devrait lancer une erreur')
      } catch (error) {
        expect(error).toBeInstanceOf(LimitError)
        expect((error as LimitError).limitName).toBe('storage')
      }
    })
  })

  describe('checkWouldGoOverLimit', () => {
    beforeEach(() => {
      vi.resetAllMocks()
    })

    it("retourne false quand la ressource n'est pas limitée", async () => {
      const service = new LimitService(db as never, makeLimits({ maxPublishers: null }))
      const result = await service.checkWouldGoOverLimit('members')
      expect(result).toBe(false)
    })

    it('retourne false quand le count est sous la limite', async () => {
      vi.mocked(db.member.count).mockResolvedValue(5)

      const service = new LimitService(db as never, makeLimits({ maxPublishers: 10 }))
      const result = await service.checkWouldGoOverLimit('members')
      expect(result).toBe(false)
    })

    it('retourne true quand le count atteint la limite', async () => {
      vi.mocked(db.member.count).mockResolvedValue(10)

      const service = new LimitService(db as never, makeLimits({ maxPublishers: 10 }))
      const result = await service.checkWouldGoOverLimit('members')
      expect(result).toBe(true)
    })

    it('retourne true quand le count dépasse la limite', async () => {
      vi.mocked(db.member.count).mockResolvedValue(15)

      const service = new LimitService(db as never, makeLimits({ maxPublishers: 10 }))
      const result = await service.checkWouldGoOverLimit('members')
      expect(result).toBe(true)
    })

    it('vérifie les territoires via db.territory.count', async () => {
      vi.mocked(db.territory.count).mockResolvedValue(3)

      const service = new LimitService(db as never, makeLimits({ maxTerritories: 5 }))
      const result = await service.checkWouldGoOverLimit('territories')
      expect(result).toBe(false)
    })

    it('vérifie les documents via db.boardDocument.count', async () => {
      vi.mocked(db.boardDocument.count).mockResolvedValue(20)

      const service = new LimitService(db as never, makeLimits({ maxBoardDocuments: 20 }))
      const result = await service.checkWouldGoOverLimit('boardDocuments')
      expect(result).toBe(true)
    })
  })

  describe('errorIfWouldGoOverLimit', () => {
    beforeEach(() => {
      vi.resetAllMocks()
    })

    it("ne lance pas d'erreur quand sous la limite", async () => {
      vi.mocked(db.member.count).mockResolvedValue(5)

      const service = new LimitService(db as never, makeLimits({ maxPublishers: 10 }))
      await expect(service.errorIfWouldGoOverLimit('members')).resolves.toBeUndefined()
    })

    it('lance LimitError quand la limite est atteinte', async () => {
      vi.mocked(db.member.count).mockResolvedValue(10)

      const service = new LimitService(db as never, makeLimits({ maxPublishers: 10 }))
      try {
        await service.errorIfWouldGoOverLimit('members')
        expect.unreachable('devrait lancer une erreur')
      } catch (error) {
        expect(error).toBeInstanceOf(LimitError)
        expect((error as LimitError).limitName).toBe('members')
      }
    })
  })
})

describe('LimitError', () => {
  it('est une instance de Error', () => {
    const error = new LimitError('members')
    expect(error).toBeInstanceOf(Error)
  })

  it('a la propriété limitName correcte', () => {
    const error = new LimitError('storage')
    expect(error.limitName).toBe('storage')
  })

  it('a un message contenant le nom de la limite', () => {
    const error = new LimitError('members')
    expect(error.message).toContain('members')
  })
})
