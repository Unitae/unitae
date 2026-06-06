import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

const { audit, AuditAction, flushPendingAuditWrites } = await import('./audit.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.auditLog.create).mockResolvedValue({} as never)
})

describe('audit', () => {
  it('cree un enregistrement avec les champs requis', () => {
    audit({
      action: AuditAction.UserLogin,
      congregationId: 10,
      actorId: 1,
      actorEmail: 'test@example.com',
    })

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'user.login',
        congregationId: 10,
        actorId: 1,
        actorEmail: 'test@example.com',
        entityType: null,
        entityId: null,
        metadata: null,
      },
    })
  })

  it('serialise les metadonnees en JSON', () => {
    audit({
      action: AuditAction.UserUpdated,
      congregationId: 10,
      actorId: 1,
      entityType: 'User',
      entityId: 5,
      metadata: { roles: ['admin', 'board-uploader'] },
    })

    const call = vi.mocked(db.auditLog.create).mock.calls[0][0]
    expect(call.data.metadata).toBe('{"roles":["admin","board-uploader"]}')
  })

  it('ne lance pas d exception si l ecriture echoue', () => {
    vi.mocked(db.auditLog.create).mockRejectedValue(new Error('DB error') as never)

    // Should not throw
    audit({
      action: AuditAction.UserLogin,
      congregationId: 10,
    })
  })
})

describe('flushPendingAuditWrites', () => {
  it('resolves only after all pending audit writes settle', async () => {
    const resolvers: Array<() => void> = []
    vi.mocked(db.auditLog.create).mockImplementation(
      () => new Promise(resolve => resolvers.push(() => resolve({} as never))) as never,
    )

    audit({ action: AuditAction.UserLogin, congregationId: 1 })
    audit({ action: AuditAction.UserLogin, congregationId: 2 })

    let flushed = false
    const flush = flushPendingAuditWrites().then(() => {
      flushed = true
    })

    await Promise.resolve()
    expect(flushed).toBe(false)

    resolvers[0]()
    await Promise.resolve()
    expect(flushed).toBe(false)

    resolvers[1]()
    await flush
    expect(flushed).toBe(true)
  })

  it('resolves immediately when no writes are pending', async () => {
    await expect(flushPendingAuditWrites()).resolves.toBeUndefined()
  })

  it('also drains writes that reject', async () => {
    vi.mocked(db.auditLog.create).mockRejectedValue(new Error('DB error') as never)

    audit({ action: AuditAction.UserLogin, congregationId: 1 })

    await expect(flushPendingAuditWrites()).resolves.toBeUndefined()
  })
})
