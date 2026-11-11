import { type AccountStatus, accountStatus } from '~/features/settings/model/account-status'
import { getLocale } from '~/i18n/paraglide/runtime'
import { isPasswordSet } from '~/shared/auth/crypto.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface UserAccountRole {
  id: number
  key: string
  name: string | null
}

export interface UserAccountRow {
  id: number
  email: string
  /** The record's name when the account has one, else the account's own. */
  firstname: string | null
  lastname: string | null
  memberId: number | null
  status: AccountStatus
  twoFactor: boolean
  /** The roles given to the account itself (custom and system roles). */
  roles: UserAccountRole[]
  /** How many roles its record gives it (member, publisher, elder…). */
  recordRoleCount: number
}

const contains = (search: string) => ({ contains: search, mode: 'insensitive' as const })

/**
 * The congregation's accounts, sorted by the name people know them by (the record's, when there is one): their state,
 * their own roles, and how many roles their record gives them. Never their password, only whether one was chosen.
 */
export async function listUserAccounts(
  db: TransactionClient,
  congregationId: number,
  { search }: { search?: string },
): Promise<UserAccountRow[]> {
  const accounts = await db.userAccount.findMany({
    where: {
      congregationId,
      ...(search
        ? {
            OR: [
              { firstname: contains(search) },
              { lastname: contains(search) },
              { email: contains(search) },
              { member: { firstname: contains(search) } },
              { member: { lastname: contains(search) } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      active: true,
      anonymizedAt: true,
      password: true,
      twoFactorEnabledAt: true,
      memberId: true,
      member: { select: { firstname: true, lastname: true } },
      roleAssignments: { select: { role: { select: { id: true, key: true, name: true } } } },
    },
  })

  const memberIds = accounts.flatMap(account => (account.memberId != null ? [account.memberId] : []))
  const recordRoles = memberIds.length
    ? await db.memberRoleAssignment.findMany({
        where: { memberId: { in: memberIds }, congregationId },
        select: { memberId: true },
      })
    : []
  const recordRoleCount = new Map<number, number>()
  for (const { memberId } of recordRoles) recordRoleCount.set(memberId, (recordRoleCount.get(memberId) ?? 0) + 1)

  const locale = getLocale()
  const byName = (a: UserAccountRow, b: UserAccountRow) =>
    (a.lastname ?? '').localeCompare(b.lastname ?? '', locale, { sensitivity: 'base' }) ||
    (a.firstname ?? '').localeCompare(b.firstname ?? '', locale, { sensitivity: 'base' }) ||
    a.email.localeCompare(b.email, locale)

  return accounts
    .map(account => ({
      id: account.id,
      email: account.email,
      firstname: account.member?.firstname ?? account.firstname,
      lastname: account.member?.lastname ?? account.lastname,
      memberId: account.memberId,
      status: accountStatus({
        active: account.active,
        anonymized: account.anonymizedAt != null,
        passwordSet: isPasswordSet(account.password),
      }),
      twoFactor: account.twoFactorEnabledAt != null,
      roles: account.roleAssignments.map(assignment => assignment.role),
      recordRoleCount: account.memberId != null ? (recordRoleCount.get(account.memberId) ?? 0) : 0,
    }))
    .sort(byName)
}
