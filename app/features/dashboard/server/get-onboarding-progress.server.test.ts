import { describe, expect, it, vi } from 'vitest'

import { getOnboardingProgress } from './get-onboarding-progress.server'

const CONGREGATION_ID = 4417
const ACCOUNT_ID = 9301
const MEMBER_ID = 7713

interface Counts {
  publishers?: number
  groups?: number
  logins?: number
  territories?: number
}

function fakeDb({ publishers = 0, groups = 0, logins = 0, territories = 0 }: Counts = {}) {
  return {
    member: { count: vi.fn().mockResolvedValue(publishers) },
    publisherGroup: { count: vi.fn().mockResolvedValue(groups) },
    userAccount: { count: vi.fn().mockResolvedValue(logins) },
    territory: { count: vi.fn().mockResolvedValue(territories) },
  }
}

const accountOnly = { accountId: ACCOUNT_ID, memberId: null, congregationId: CONGREGATION_ID }
const withRecord = { accountId: ACCOUNT_ID, memberId: MEMBER_ID, congregationId: CONGREGATION_ID }

describe('getOnboardingProgress', () => {
  it('reports every step open on a brand-new congregation seen by its account-only founder', async () => {
    const progress = await getOnboardingProgress(fakeDb() as never, accountOnly)

    expect(progress.steps).toEqual({
      ownRecord: false,
      publishers: false,
      groups: false,
      logins: false,
      territories: false,
    })
    expect(progress.complete).toBe(false)
  })

  it('ticks the own-record step once the viewer has a linked member', async () => {
    const progress = await getOnboardingProgress(fakeDb() as never, withRecord)

    expect(progress.steps.ownRecord).toBe(true)
  })

  it('ticks each congregation step from its own count', async () => {
    const progress = await getOnboardingProgress(
      fakeDb({ publishers: 12, groups: 3, logins: 2, territories: 40 }) as never,
      withRecord,
    )

    expect(progress.steps).toEqual({
      ownRecord: true,
      publishers: true,
      groups: true,
      logins: true,
      territories: true,
    })
    expect(progress.complete).toBe(true)
  })

  it("does not let the viewer's own record tick the publishers step", async () => {
    const db = fakeDb()

    await getOnboardingProgress(db as never, withRecord)

    expect(db.member.count).toHaveBeenCalledWith({
      where: { congregationId: CONGREGATION_ID, isPublisher: true, leftAt: null, id: { not: MEMBER_ID } },
    })
  })

  it('counts every active publisher when the viewer has no record to exclude', async () => {
    const db = fakeDb()

    await getOnboardingProgress(db as never, accountOnly)

    expect(db.member.count).toHaveBeenCalledWith({
      where: { congregationId: CONGREGATION_ID, isPublisher: true, leftAt: null },
    })
  })

  it("does not let the viewer's own login tick the logins step", async () => {
    const db = fakeDb()

    await getOnboardingProgress(db as never, accountOnly)

    expect(db.userAccount.count).toHaveBeenCalledWith({
      where: { congregationId: CONGREGATION_ID, id: { not: ACCOUNT_ID }, active: true, anonymizedAt: null },
    })
  })

  it('stays incomplete while one congregation step is open', async () => {
    const progress = await getOnboardingProgress(
      fakeDb({ publishers: 12, groups: 0, logins: 2, territories: 40 }) as never,
      withRecord,
    )

    expect(progress.complete).toBe(false)
  })

  it('is complete once the congregation is set up, even if the viewer never created a record', async () => {
    // A circuit overseer or external admin has no record and never will: the personal step
    // must not hold the checklist open on an otherwise finished congregation.
    const progress = await getOnboardingProgress(
      fakeDb({ publishers: 12, groups: 3, logins: 2, territories: 40 }) as never,
      accountOnly,
    )

    expect(progress.steps.ownRecord).toBe(false)
    expect(progress.complete).toBe(true)
  })
})
