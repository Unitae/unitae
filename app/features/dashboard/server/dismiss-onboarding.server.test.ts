import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/domain/audit.server', () => ({
  audit: vi.fn(),
  AuditAction: { OnboardingDismissed: 'user.onboarding.dismissed' },
}))

const { dismissOnboarding } = await import('./dismiss-onboarding.server')
const { audit } = await import('~/shared/domain/audit.server')

const CONGREGATION_ID = 5521
const ACCOUNT_ID = 8834
const NOW = new Date(2026, 10, 1, 21, 30)

function fakeDb(updatedRows: number) {
  return { userAccount: { updateMany: vi.fn().mockResolvedValue({ count: updatedRows }) } }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('dismissOnboarding', () => {
  it("stamps the account's dismissal, scoped to its congregation", async () => {
    const db = fakeDb(1)

    const dismissed = await dismissOnboarding(db as never, ACCOUNT_ID, CONGREGATION_ID, ACCOUNT_ID, NOW)

    expect(dismissed).toBe(true)
    expect(db.userAccount.updateMany).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID, congregationId: CONGREGATION_ID, onboardingDismissedAt: null },
      data: { onboardingDismissedAt: NOW },
    })
  })

  it('records the dismissal in the audit trail', async () => {
    await dismissOnboarding(fakeDb(1) as never, ACCOUNT_ID, CONGREGATION_ID, ACCOUNT_ID, NOW)

    expect(audit).toHaveBeenCalledWith({
      action: 'user.onboarding.dismissed',
      congregationId: CONGREGATION_ID,
      actorId: ACCOUNT_ID,
      entityType: 'UserAccount',
      entityId: ACCOUNT_ID,
    })
  })

  it('keeps the first dismissal and records nothing when it was already closed', async () => {
    // The `onboardingDismissedAt: null` guard matched no row: a second device, or a resubmit.
    const dismissed = await dismissOnboarding(fakeDb(0) as never, ACCOUNT_ID, CONGREGATION_ID, ACCOUNT_ID, NOW)

    expect(dismissed).toBe(false)
    expect(audit).not.toHaveBeenCalled()
  })
})
