import { describe, expect, it } from 'vitest'
import { responsibleForPage } from './schedule-responsible'

// What the event page shows of a schedule's responsible (D37): the titulaire and the adjoints, the other holders only
// when there is neither, four at most; « vous » for the reader, named or not.

const holder = (
  firstname: string,
  seat: 'leader' | 'deputy' | 'member',
  ids: { memberId?: number; accountId?: number },
) => ({
  memberId: ids.memberId ?? null,
  accountId: ids.accountId ?? null,
  firstname,
  lastname: 'TEST',
  seat,
})
const role = { key: 'services', name: 'Services' }
const viewer = (roleIds: number[], memberId: number | null = 7, accountId = 70) => ({ accountId, memberId, roleIds })

describe('responsibleForPage', () => {
  it('names the titulaire and the adjoints, leaves the other holders out, and marks the reader', () => {
    const page = responsibleForPage(
      9,
      {
        role,
        holders: [
          holder('Paul', 'leader', { memberId: 1 }),
          holder('Luc', 'deputy', { memberId: 7 }),
          holder('Marc', 'member', { memberId: 3 }),
        ],
      },
      viewer([9]),
    )
    expect(page).toEqual({
      role,
      holders: [
        { key: 'leader-0', firstname: 'Paul', lastname: 'TEST', seat: 'leader', you: false },
        { key: 'deputy-1', firstname: 'Luc', lastname: 'TEST', seat: 'deputy', you: true },
      ],
      youHoldIt: true,
    })
  })

  it('says the reader holds the role when they are not among those named', () => {
    const page = responsibleForPage(9, { role, holders: [holder('Paul', 'leader', { memberId: 1 })] }, viewer([9], 3))
    expect(page.youHoldIt).toBe(true)
    expect(page.holders.some(shown => shown.you)).toBe(false)
  })

  it('names the other holders, four at most, when the role has neither titulaire nor adjoint', () => {
    const holders = ['A', 'B', 'C', 'D', 'E'].map((name, i) => holder(name, 'member', { memberId: 10 + i }))
    const page = responsibleForPage(9, { role, holders }, viewer([]))
    expect(page.holders.map(shown => shown.firstname)).toEqual(['A', 'B', 'C', 'D'])
    expect(page.youHoldIt).toBe(false)
  })

  it('marks an account without a record by its account', () => {
    const page = responsibleForPage(
      9,
      { role, holders: [holder('Nora', 'deputy', { accountId: 70 })] },
      viewer([9], null),
    )
    expect(page.holders).toEqual([{ key: 'deputy-0', firstname: 'Nora', lastname: 'TEST', seat: 'deputy', you: true }])
  })
})

describe('responsibleForPage, never the wrong reader', () => {
  it('marks no account-only holder for a reader without a record, and goes by the role it is given', () => {
    const page = responsibleForPage(
      9,
      { role, holders: [holder('Nora', 'deputy', { accountId: 71 })] },
      viewer([4], null),
    )
    expect(page.holders.map(shown => shown.you)).toEqual([false])
    expect(page.youHoldIt).toBe(false)
  })
})
