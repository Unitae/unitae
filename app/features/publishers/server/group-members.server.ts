import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

import * as memberAggregate from './member.aggregate'

const NAME = { id: true, firstname: true, lastname: true } as const

/**
 * Puts an active publisher in the group, taking them out of the one they were in. Resolves to their
 * name for the confirmation. Throws a NotFoundError for a member who is not an active publisher, or a
 * group outside the congregation, and the aggregate's ConflictError for the leader of another group.
 */
export async function addGroupMember(
  db: TransactionClient,
  groupId: number,
  congregationId: number,
  memberId: number,
  actorId: number,
) {
  const [group, member] = await Promise.all([
    db.publisherGroup.findFirst({ where: { id: groupId, congregationId }, select: { id: true } }),
    db.member.findFirst({
      where: { id: memberId, congregationId, isPublisher: true, leftAt: null, anonymizedAt: null },
      select: NAME,
    }),
  ])
  if (!group || !member) throw new NotFoundError('Member', memberId)

  await memberAggregate.setGroup(db, memberId, congregationId, groupId, actorId)
  return { firstname: member.firstname, lastname: member.lastname }
}

/**
 * Takes a member of the group out of every group. Resolves to their name for the confirmation.
 * Throws a NotFoundError for someone not in the group, and the aggregate's ConflictError for its
 * overseer or deputy.
 */
export async function removeGroupMember(
  db: TransactionClient,
  groupId: number,
  congregationId: number,
  memberId: number,
  actorId: number,
) {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId, publisherGroupId: groupId },
    select: NAME,
  })
  if (!member) throw new NotFoundError('Member', memberId)

  await memberAggregate.setGroup(db, memberId, congregationId, null, actorId)
  return { firstname: member.firstname, lastname: member.lastname }
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
