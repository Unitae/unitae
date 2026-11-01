import { NotFoundError } from '~/shared/errors/app-error.server'
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
