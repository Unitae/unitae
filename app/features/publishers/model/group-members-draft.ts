import type { GroupLeaderCandidate } from './group-leader-availability'

type GroupRef = { id: number; name: string }
type Person = { id: number; firstname: string | null; lastname: string | null }

/** Someone the group form offers: the group they lead, if any, and the one they are in. */
export interface GroupCandidate extends Person, GroupLeaderCandidate {
  group: GroupRef | null
}

/** Someone already in the group, as its edit page lists them. */
export interface GroupMember extends Person {
  inactive: boolean
}

export type MemberRowState = 'kept' | 'removed' | 'added'

export interface MemberRow {
  person: Person
  state: MemberRowState
  inactive: boolean
  /** Their overseer or assistant role here, as the form now stands. */
  role: 'responsible' | 'deputy' | null
  /** The group an added person leaves; null for someone in no group. */
  from: GroupRef | null
}

export interface GroupMembersDraft {
  /** Who is in the group now (nobody for a group being created). */
  members: GroupMember[]
  /** Who may be added. */
  candidates: GroupCandidate[]
  /** The brothers the leader fields offer, with the group each is in. */
  leaders: GroupCandidate[]
  /** The overseer and assistant chosen in the form (`null` for none). */
  responsibleId: number | null
  deputyId: number | null
  /** Who was added and removed so far, in order. */
  added: number[]
  removed: number[]
}

/**
 * The « Proclamateurs » section as the form now stands. The overseer and assistant chosen in the form belong to the
 * group: one who comes from elsewhere shows as added (the save moves them in), and neither can be removed, whatever
 * was staged for them before. What the form posts is the changes only: `added` and `removed`.
 */
export function groupMemberRows({
  members,
  candidates,
  leaders,
  responsibleId,
  deputyId,
  added,
  removed,
}: GroupMembersDraft) {
  const roleOf = (id: number): MemberRow['role'] => {
    if (id === responsibleId) return 'responsible'
    if (id === deputyId) return 'deputy'
    return null
  }
  const memberIds = new Set(members.map(member => member.id))
  const leaderIds = [responsibleId, deputyId].filter((id): id is number => id != null)
  const removedNow = removed.filter(id => memberIds.has(id) && roleOf(id) == null)
  // Leaders from elsewhere join with the save itself: they are shown, not posted.
  const joining = leaderIds.filter(id => !memberIds.has(id) && !added.includes(id))
  const byId = new Map([...leaders, ...candidates].map(person => [person.id, person]))

  const rows: MemberRow[] = [
    ...members.map(member => ({
      person: member,
      state: removedNow.includes(member.id) ? ('removed' as const) : ('kept' as const),
      inactive: member.inactive,
      role: roleOf(member.id),
      from: null,
    })),
    ...[...joining, ...added].flatMap(id => {
      const person = byId.get(id)
      return person ? [{ person, state: 'added' as const, inactive: false, role: roleOf(id), from: person.group }] : []
    }),
  ]

  return {
    rows,
    /** Posted as `addMember`. */
    added: added.filter(id => !memberIds.has(id)),
    /** Posted as `removeMember`. */
    removed: removedNow,
    /** How many will be in the group once saved. */
    total: rows.filter(row => row.state !== 'removed').length,
    /** The candidates the « Ajouter un proclamateur » picker still offers. */
    available: candidates.filter(candidate => !added.includes(candidate.id) && !leaderIds.includes(candidate.id)),
  }
}
