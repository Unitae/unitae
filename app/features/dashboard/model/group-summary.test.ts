import { describe, expect, it } from 'vitest'

import { summarizeGroup } from './group-summary'

const OCTOBER = { month: 9, year: 2026 }
const window = [{ month: 8, year: 2026 }, OCTOBER]

type Status = 'filed' | 'irregular' | 'not-filed' | 'not-expected'
const person = (
  id: number,
  october: Status,
  extra: { signals?: { kind: string; since?: { month: number; year: number } }[]; gaps?: string[] } = {},
) => ({
  id,
  firstname: `P${id}`,
  lastname: `L${id}`,
  reports: [
    { ...window[0], status: 'filed' as Status },
    { ...OCTOBER, status: october },
  ],
  signals: extra.signals ?? [],
  emergencyGaps: extra.gaps ?? [],
})

describe('summarizeGroup', () => {
  it('sums up what the group overseer has to act on, from the group page data', () => {
    const summary = summarizeGroup({
      id: 7,
      name: 'Nord',
      reportWindow: window,
      members: [
        person(1, 'filed'),
        person(2, 'irregular', { signals: [{ kind: 'new-arrival' }] }),
        person(3, 'not-filed', { gaps: ['card'] }),
        person(4, 'not-filed', { signals: [{ kind: 'baptism-anniversary' }, { kind: 'last-visit' }] }),
        person(5, 'not-expected', { signals: [{ kind: 'new-arrival' }], gaps: ['contact', 'backpack'] }),
      ],
      inactiveMembers: [
        person(6, 'not-filed', { signals: [{ kind: 'inactive', since: { month: 5, year: 2026 } }] }),
        person(8, 'not-filed', { signals: [{ kind: 'inactive', since: { month: 7, year: 2026 } }] }),
      ],
    })

    expect(summary).toEqual({
      id: 7,
      name: 'Nord',
      memberCount: 5,
      month: OCTOBER,
      reports: {
        expected: 4,
        received: 2,
        missing: [
          { id: 3, firstname: 'P3', lastname: 'L3' },
          { id: 4, firstname: 'P4', lastname: 'L4' },
        ],
      },
      newArrivals: 2,
      anniversaries: 1,
      inactive: { count: 2, since: { month: 5, year: 2026 } },
      incompleteEmergency: 2,
    })
  })

  it('reads an empty window or an empty group as nothing to do', () => {
    const summary = summarizeGroup({ id: 1, name: 'Sud', reportWindow: [], members: [], inactiveMembers: [] })
    expect(summary.month).toBeNull()
    expect(summary.reports).toEqual({ expected: 0, received: 0, missing: [] })
    expect(summary.inactive).toEqual({ count: 0, since: null })
  })
})
