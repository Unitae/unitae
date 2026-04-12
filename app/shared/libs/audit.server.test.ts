import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  unscopedDb: {
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('~/shared/libs/logger.server', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

const { audit, AuditAction } = await import('./audit.server')
const { unscopedDb: db } = await import('~/shared/libs/db.server')

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
