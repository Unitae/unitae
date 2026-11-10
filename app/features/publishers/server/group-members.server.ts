import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

import * as memberAggregate from './member.aggregate'

/** Who the group form added and removed: the changes only, so a move made meanwhile elsewhere is not undone. */
export interface GroupMemberChanges {
  add: number[]
  remove: number[]
}

/**
 * Applies the group form's added and removed publishers. Added: the active publishers among them join the group,
 * leaving the one they were in. Removed: those still in the group leave every group. The aggregate refuses to move
 * a group's overseer or deputy out of the group they lead (ConflictError): the save runs in one transaction, so that
 * refusal undoes the rest of it. Throws a NotFoundError for a group outside the congregation.
 */
export async function changeGroupMembers(
  db: TransactionClient,
  groupId: number,
  congregationId: number,
  { add, remove }: GroupMemberChanges,
  actorId: number,
): Promise<void> {
  if (add.length === 0 && remove.length === 0) return

  const group = await db.publisherGroup.findFirst({ where: { id: groupId, congregationId }, select: { id: true } })
  if (!group) throw new NotFoundError('PublisherGroup', groupId)

  const joining = await db.member.findMany({
    where: { id: { in: add }, congregationId, isPublisher: true, leftAt: null, anonymizedAt: null },
    select: { id: true },
  })
  for (const member of joining) await memberAggregate.setGroup(db, member.id, congregationId, groupId, actorId)

  const leaving = await db.member.findMany({
    where: { id: { in: remove }, congregationId, publisherGroupId: groupId },
    select: { id: true },
  })
  for (const member of leaving) await memberAggregate.setGroup(db, member.id, congregationId, null, actorId)
}

export interface GroupMove {
  /** The destination, or null when they were taken out of every group. */
  group: { name: string } | null
  moved: number
  /** Why some could not move: each is the leader of another group. */
  refused: string[]
}

/**
 * Moves several active publishers at once, from the publishers list: into the group, or out of
 * every group when `groupId` is null. The leader of another group stays where they are and is
 * reported instead of failing the rest. Throws a NotFoundError for a group outside the congregation.
 */
export async function moveMembersToGroup(
  db: TransactionClient,
  groupId: number | null,
  congregationId: number,
  memberIds: number[],
  actorId: number,
): Promise<GroupMove> {
  const [group, members] = await Promise.all([
    groupId == null
      ? Promise.resolve(null)
      : db.publisherGroup.findFirst({ where: { id: groupId, congregationId }, select: { name: true } }),
    db.member.findMany({
      where: { id: { in: memberIds }, congregationId, isPublisher: true, leftAt: null, anonymizedAt: null },
      select: { id: true },
    }),
  ])
  if (groupId != null && group == null) throw new NotFoundError('PublisherGroup', groupId)

  let moved = 0
  const refused: string[] = []
  for (const member of members) {
    try {
      await memberAggregate.setGroup(db, member.id, congregationId, groupId, actorId)
      moved++
    } catch (error) {
      // Raised before any write, so the rest of the move goes on.
      if (!(error instanceof ConflictError)) throw error
      refused.push(error.message)
    }
  }
  return { group: group == null ? null : { name: group.name }, moved, refused }
}
