import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { consumeDemoSignInToken, demoAccountFor } from '~/features/demo/server/demo-sign-in.server'
import { hashToken } from '~/shared/auth/crypto.server'
import type { TransactionClient } from '~/shared/infra/db.server'

const NOW = new Date('2026-11-20T10:00:00Z')

function fakeDb() {
  return {
    demoSignInToken: { updateMany: vi.fn(), findUnique: vi.fn() },
    setting: { findFirst: vi.fn() },
    userAccount: { findFirst: vi.fn() },
  }
}

let db: ReturnType<typeof fakeDb>
beforeEach(() => {
  db = fakeDb()
})

describe('consumeDemoSignInToken', () => {
  it('spends a valid token once and gives its role', async () => {
    db.demoSignInToken.updateMany.mockResolvedValue({ count: 1 })
    db.demoSignInToken.findUnique.mockResolvedValue({ role: 'secretary' })

    await expect(consumeDemoSignInToken(db as unknown as TransactionClient, 'raw-token', 7, NOW)).resolves.toBe(
      'secretary',
    )
    // Only unused, unexpired tokens of this congregation, found by their hash.
    expect(db.demoSignInToken.updateMany).toHaveBeenCalledWith({
      where: { token: hashToken('raw-token'), congregationId: 7, usedAt: null, expiresAt: { gt: NOW } },
      data: { usedAt: NOW },
    })
  })

  it('refuses a token that is used, expired, unknown or another congregation’s', async () => {
    db.demoSignInToken.updateMany.mockResolvedValue({ count: 0 })

    await expect(consumeDemoSignInToken(db as unknown as TransactionClient, 'raw-token', 7, NOW)).resolves.toBeNull()
    expect(db.demoSignInToken.findUnique as Mock).not.toHaveBeenCalled()
  })

  it('refuses a token whose role isn’t one the demo knows', async () => {
    db.demoSignInToken.updateMany.mockResolvedValue({ count: 1 })
    db.demoSignInToken.findUnique.mockResolvedValue({ role: 'admin' })

    await expect(consumeDemoSignInToken(db as unknown as TransactionClient, 'raw-token', 7, NOW)).resolves.toBeNull()
  })

  it('refuses an empty token without reading the database', async () => {
    await expect(consumeDemoSignInToken(db as unknown as TransactionClient, '', 7, NOW)).resolves.toBeNull()
    expect(db.demoSignInToken.updateMany).not.toHaveBeenCalled()
  })
})

describe('demoAccountFor', () => {
  it('reads the login a role signs in as', async () => {
    db.setting.findFirst.mockResolvedValue({ value: JSON.stringify({ secretary: 412, publisher: 418 }) })
    db.userAccount.findFirst.mockResolvedValue({ id: 412 })

    await expect(demoAccountFor(db as unknown as TransactionClient, 7, 'secretary')).resolves.toBe(412)
  })

  it('refuses a login that isn’t this copy’s, whatever the setting says', async () => {
    db.setting.findFirst.mockResolvedValue({ value: JSON.stringify({ secretary: 412 }) })
    db.userAccount.findFirst.mockResolvedValue(null)

    await expect(demoAccountFor(db as unknown as TransactionClient, 7, 'secretary')).resolves.toBeNull()
    expect(db.userAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 412, congregationId: 7 },
      select: { id: true },
    })
  })

  it('reads no login from a setting that isn’t an object', async () => {
    db.setting.findFirst.mockResolvedValue({ value: 'null' })
    await expect(demoAccountFor(db as unknown as TransactionClient, 7, 'secretary')).resolves.toBeNull()
  })

  it('gives nothing for a congregation the demo seed hasn’t filled, or a setting it can’t read', async () => {
    db.setting.findFirst.mockResolvedValue(null)
    await expect(demoAccountFor(db as unknown as TransactionClient, 7, 'secretary')).resolves.toBeNull()
    db.setting.findFirst.mockResolvedValue({ value: '{broken' })
    await expect(demoAccountFor(db as unknown as TransactionClient, 7, 'secretary')).resolves.toBeNull()
  })
})
