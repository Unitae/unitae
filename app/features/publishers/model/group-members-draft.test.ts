import { describe, expect, it } from 'vitest'

import { type GroupCandidate, type GroupMembersDraft, groupMemberRows } from './group-members-draft'

const person = (id: number, lastname: string) => ({ id, firstname: 'A', lastname })
const NORD = { id: 2, name: 'Nord' }
const candidate = (id: number, lastname: string, group: GroupCandidate['group'] = null): GroupCandidate => ({
  ...person(id, lastname),
  responsibleFor: null,
  deputyFor: null,
  group,
})

const BASE: GroupMembersDraft = {
  members: [
    { ...person(1, 'Dupont'), inactive: false },
    { ...person(2, 'Roux'), inactive: true },
  ],
  candidates: [candidate(5, 'Leroy', NORD), candidate(6, 'Garnier')],
  leaders: [candidate(1, 'Dupont'), candidate(9, 'Perrin', NORD)],
  responsibleId: 1,
  deputyId: null,
  saved: { responsibleId: 1, deputyId: null },
  added: [],
  removed: [],
}

const states = (draft: GroupMembersDraft) =>
  groupMemberRows(draft).rows.map(row => [row.person.id, row.state, row.role, row.from?.name ?? null])

describe('groupMemberRows', () => {
  it('lists the group as it is, with the overseer marked and the inactive said', () => {
    const { rows, total, added, removed } = groupMemberRows(BASE)

    expect(rows.map(row => [row.person.id, row.state, row.role, row.inactive])).toEqual([
      [1, 'kept', 'responsible', false],
      [2, 'kept', null, true],
    ])
    expect({ total, added, removed }).toEqual({ total: 2, added: [], removed: [] })
  })

  it('shows someone added with the group they leave, and posts them', () => {
    const draft = groupMemberRows({ ...BASE, added: [5] })

    expect(states({ ...BASE, added: [5] })).toContainEqual([5, 'added', null, 'Nord'])
    expect(draft.added).toEqual([5])
    expect(draft.total).toBe(3)
    expect(draft.available.map(each => each.id)).toEqual([6])
  })

  it('strikes someone removed without counting them, and posts them', () => {
    const draft = groupMemberRows({ ...BASE, removed: [2] })

    expect(states({ ...BASE, removed: [2] })).toContainEqual([2, 'removed', null, null])
    expect(draft.removed).toEqual([2])
    expect(draft.total).toBe(1)
  })

  // The save moves a leader into the group they lead: shown as added, not posted, never removable.
  it('shows an assistant chosen from another group as added, without posting him', () => {
    const draft = groupMemberRows({ ...BASE, deputyId: 9 })

    expect(states({ ...BASE, deputyId: 9 })).toContainEqual([9, 'added', 'deputy', 'Nord'])
    expect(draft.added).toEqual([])
    expect(draft.total).toBe(3)
  })

  // Swapping leaders and removing the old one in the same edit is allowed; removing the new one is not.
  // The save still moves a current leader in, but nothing was edited: the form says nothing about it.
  it('says nothing about a current leader who is in another group until a leader is changed', () => {
    const draft = groupMemberRows({ ...BASE, deputyId: 9, saved: { responsibleId: 1, deputyId: 9 } })

    expect(draft.rows.map(row => row.person.id)).toEqual([1, 2])
    expect(draft.total).toBe(2)
  })

  it('keeps a leader chosen in the form even if he was removed before, and frees the one replaced', () => {
    const swapped = groupMemberRows({ ...BASE, responsibleId: 2, removed: [1, 2] })

    expect(swapped.removed).toEqual([1])
    expect(swapped.rows.find(row => row.person.id === 2)).toMatchObject({ state: 'kept', role: 'responsible' })
  })

  it('does not offer the leaders chosen in the form to the picker', () => {
    const draft = groupMemberRows({ ...BASE, deputyId: 6 })

    expect(draft.available.map(each => each.id)).toEqual([5])
  })
})
