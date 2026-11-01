import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

import { assertGroupLeaders } from './group-leaders.server'
import * as memberAggregate from './member.aggregate'

export interface UpdateGroupParams {
  name: string
  address: string
  responsibleId: number
  deputyId: number | null
}

/** Throws a ValidationError on the field at fault when the chosen leaders cannot lead this group. */
export async function updateGroup(
  db: TransactionClient,
  groupId: number,
  congregationId: number,
  actorId: number,
  params: UpdateGroupParams,
) {
  await assertGroupLeaders(db, congregationId, {
    responsibleId: params.responsibleId,
    deputyId: params.deputyId,
    groupId,
  })

  const group = await db.publisherGroup.update({
    where: {
      id_congregationId: { id: groupId, congregationId },
    },
    data: {
      name: params.name,
      adress: params.address,
      deputyId: params.deputyId,
      responsibleId: params.responsibleId,
    },
  })

  // Leaders belong to the group they lead: once the group names them, move them into it.
  await joinLedGroup(db, groupId, congregationId, actorId, params)

  audit({
    action: AuditAction.PublisherGroupUpdated,
    congregationId,
    actorId,
    entityType: 'PublisherGroup',
    entityId: groupId,
  })

  return group
}

/** Moves a group's overseer and deputy into it, through the member aggregate. */
export async function joinLedGroup(
  db: TransactionClient,
  groupId: number,
  congregationId: number,
  actorId: number,
  { responsibleId, deputyId }: { responsibleId: number; deputyId: number | null },
) {
  await memberAggregate.setGroup(db, responsibleId, congregationId, groupId, actorId)
  if (deputyId != null) await memberAggregate.setGroup(db, deputyId, congregationId, groupId, actorId)
}
