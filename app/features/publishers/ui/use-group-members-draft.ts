import { useState } from 'react'
import { type GroupMembersDraft, groupMemberRows } from '~/features/publishers/model/group-members-draft'

/** The « Proclamateurs » section's state until « Enregistrer »: who was added and removed, and the rows that follow. */
export function useGroupMembersDraft(draft: Omit<GroupMembersDraft, 'added' | 'removed'>) {
  const [added, setAdded] = useState<number[]>([])
  const [removed, setRemoved] = useState<number[]>([])
  const memberIds = new Set(draft.members.map(member => member.id))

  return {
    ...groupMemberRows({ ...draft, added, removed }),
    add: (id: number) => setAdded(list => (list.includes(id) ? list : [...list, id])),
    /** Removes someone in the group, or takes back someone added. */
    remove: (id: number) =>
      memberIds.has(id) ? setRemoved(list => [...list, id]) : setAdded(list => list.filter(each => each !== id)),
    restore: (id: number) => setRemoved(list => list.filter(each => each !== id)),
  }
}
