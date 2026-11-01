import type { Prisma } from '~/database/generated/client'
import * as m from '~/i18n/paraglide/messages'
import { ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Who may oversee or assist a field service group: a brother still in the congregation who is an
 * elder or a ministerial servant. The one definition, read by the form's choices and by the check
 * every write runs, so the two cannot drift apart.
 */
export const GROUP_LEADER_WHERE = {
  leftAt: null,
  anonymizedAt: null,
  isMale: true,
  OR: [{ isHelder: true }, { isServant: true }],
} satisfies Prisma.MemberWhereInput

export interface GroupLeaders {
  responsibleId: number
  deputyId: number | null
  /** The group being edited; absent when creating one. Its own leaders may swap places. */
  groupId?: number
}

type LeaderField = 'responsible' | 'deputy'

/**
 * Throws a ValidationError on the form field at fault when the chosen overseer or deputy is not an
 * eligible brother, is the same person twice, or already leads another group. The form already
 * holds those back; this is what a stale page or a hand-made request runs into instead of a write
 * the unique constraints turn into a 500.
 */
export async function assertGroupLeaders(
  db: TransactionClient,
  congregationId: number,
  { responsibleId, deputyId, groupId }: GroupLeaders,
): Promise<void> {
  if (deputyId != null && deputyId === responsibleId) {
    throw new ValidationError('deputy', m.groups_form_error_same_person())
  }

  const ids = deputyId != null ? [responsibleId, deputyId] : [responsibleId]
  const leaders = await db.member.findMany({
    where: { id: { in: ids }, congregationId, ...GROUP_LEADER_WHERE },
    select: {
      id: true,
      responsibleFor: { select: { id: true, name: true } },
      deputyFor: { select: { id: true, name: true } },
    },
  })

  const chosen: [LeaderField, number][] = [['responsible', responsibleId]]
  if (deputyId != null) chosen.push(['deputy', deputyId])

  for (const [field, id] of chosen) {
    const leader = leaders.find(each => each.id === id)
    if (!leader) throw new ValidationError(field, m.groups_form_error_not_eligible())
    if (leader.responsibleFor && leader.responsibleFor.id !== groupId) {
      throw new ValidationError(field, m.groups_form_error_already_responsible({ name: leader.responsibleFor.name }))
    }
    if (leader.deputyFor && leader.deputyFor.id !== groupId) {
      throw new ValidationError(field, m.groups_form_error_already_deputy({ name: leader.deputyFor.name }))
    }
  }
}
