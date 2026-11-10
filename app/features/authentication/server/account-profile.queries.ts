import type { AccountProfile } from '~/features/authentication/model/account-profile.type'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * The signed-in account's own profile. The congregation keeps the record, so the page names who can correct it:
 * the overseer of the person's group.
 */
export async function getAccountProfile(db: TransactionClient, accountId: number): Promise<AccountProfile | null> {
  const account = await db.userAccount.findFirst({
    where: { id: accountId },
    select: {
      email: true,
      firstname: true,
      lastname: true,
      member: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          isPublisher: true,
          publisherGroup: {
            select: { name: true, responsible: { select: { id: true, firstname: true, lastname: true } } },
          },
        },
      },
    },
  })
  if (account == null) return null

  const { member } = account
  if (member == null) {
    return {
      email: account.email,
      firstname: account.firstname,
      lastname: account.lastname,
      record: 'none',
      group: null,
    }
  }

  const group = member.publisherGroup
  const leadsIt = group?.responsible.id === member.id
  return {
    email: account.email,
    firstname: member.firstname,
    lastname: member.lastname,
    record: member.isPublisher ? 'publisher' : 'not-publisher',
    group: group
      ? {
          name: group.name,
          overseer: leadsIt ? null : { firstname: group.responsible.firstname, lastname: group.responsible.lastname },
        }
      : null,
  }
}
