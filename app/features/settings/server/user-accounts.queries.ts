import { type AccountStatus, accountStatus } from '~/features/settings/model/account-status'
import { getLocale } from '~/i18n/paraglide/runtime'
import { isPasswordSet } from '~/shared/auth/crypto.server'
import { isIdentityRoleKey, SYSTEM_ROLE_KEYS } from '~/shared/domain/built-in-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
import { formatPersonName } from '~/shared/utils/format-person-name'

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
      member: {
        select: {
          firstname: true,
          lastname: true,
          roleAssignments: { select: { role: { select: { id: true, key: true, name: true } } } },
        },
      },
      roleAssignments: { select: { role: { select: { id: true, key: true, name: true } } } },
    },
  })

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
      // Roles given by hand, on the login or the record; the record's identity roles are only counted.
      roles: [...account.roleAssignments, ...(account.member?.roleAssignments ?? [])]
        .map(assignment => assignment.role)
        .filter(role => !isIdentityRoleKey(role.key)),
      recordRoleCount: (account.member?.roleAssignments ?? []).filter(a => isIdentityRoleKey(a.role.key)).length,
    }))
    .sort(byName)
}

export interface AccountPageRole extends UserAccountRole {
  description: string | null
  /** Seated from the organigram (a single-person role, a committee post): never ticked here. */
  fromOrganigram: boolean
  /** One seat only (a post), as opposed to a box of the organigram several people fill. */
  single: boolean
  /** The account holds it. */
  assigned: boolean
  /** The viewer may give it or take it away: they hold all its rights (an administrator holds them all). */
  grantable: boolean
  holderCount: number
  /** Who holds a role seated from the organigram. */
  holders: string[]
}

export interface AccountPage {
  id: number
  email: string
  firstname: string | null
  lastname: string | null
  memberId: number | null
  /** Its record is a publisher's (a record can also be a student's, or a former publisher's). */
  isPublisher: boolean
  active: boolean
  anonymizedAt: Date | null
  twoFactorEnabledAt: Date | null
  status: AccountStatus
  /** The roles an account can be given, the administrator first, then by name. */
  roles: AccountPageRole[]
  /** The identity roles of its record (member, publisher, sister…), which follow the record's flags. */
  recordRoles: UserAccountRole[]
}

const NAME = { firstname: true, lastname: true } as const

const holderName = (person: { firstname: string | null; lastname: string | null }) => formatPersonName(person, '')

/**
 * Everything the account page shows: the account and where it stands, the roles it can be given (custom roles, the
 * administrator, the single-person roles seated from the organigram) with which it holds and which the viewer may give,
 * and the roles its record gives it.
 */
export async function getAccountPage(
  db: TransactionClient,
  accountId: number,
  congregationId: number,
  actorPermissions: ReadonlySet<string>,
): Promise<AccountPage | null> {
  const account = await db.userAccount.findFirst({
    where: { id: accountId, congregationId },
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
      member: {
        select: {
          firstname: true,
          lastname: true,
          isPublisher: true,
          roleAssignments: { select: { role: { select: { id: true, key: true, name: true } } } },
        },
      },
      roleAssignments: { select: { roleId: true } },
    },
  })
  if (!account) return null

  const roles = await db.role.findMany({
    where: { congregationId },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      isSinglePerson: true,
      isBuiltIn: true,
      permissions: { select: { permission: { select: { key: true } } } },
      members: { select: { user: { select: { firstname: true, lastname: true, member: { select: NAME } } } } },
      memberAssignments: { select: { member: { select: NAME } } },
    },
  })

  // The roles it holds: given to the record (where they live when there is one) or to the login.
  const own = new Set([
    ...account.roleAssignments.map(assignment => assignment.roleId),
    ...(account.member?.roleAssignments ?? []).map(assignment => assignment.role.id),
  ])
  const actorIsAdmin = actorPermissions.has(Permission.CanDoAnything)
  const locale = getLocale()
  const pageRoles: AccountPageRole[] = roles
    // The identity roles follow the record; they are listed apart.
    .filter(role => !isIdentityRoleKey(role.key))
    .map(role => {
      // Only custom roles and the administrator are ticked here; the others are seats of the organigram.
      const fromOrganigram = role.isSinglePerson || (role.isBuiltIn && !SYSTEM_ROLE_KEYS.some(key => key === role.key))
      return {
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        fromOrganigram,
        single: role.isSinglePerson,
        assigned: own.has(role.id),
        grantable:
          !fromOrganigram &&
          (actorIsAdmin ||
            (!role.permissions.some(({ permission }) => permission.key === Permission.CanDoAnything) &&
              role.permissions.every(({ permission }) => actorPermissions.has(permission.key)))),
        holderCount: role.members.length + role.memberAssignments.length,
        holders: fromOrganigram
          ? [
              ...role.members.map(({ user }) => holderName(user.member ?? user)),
              ...role.memberAssignments.map(({ member }) => holderName(member)),
            ]
          : [],
      }
    })
    .sort((a, b) => {
      const rank = (role: AccountPageRole) => (role.key === 'admin' ? 0 : role.fromOrganigram ? 2 : 1)
      return (
        rank(a) - rank(b) || getRoleDisplayName(a).localeCompare(getRoleDisplayName(b), locale, { sensitivity: 'base' })
      )
    })

  return {
    id: account.id,
    email: account.email,
    firstname: account.member?.firstname ?? account.firstname,
    lastname: account.member?.lastname ?? account.lastname,
    memberId: account.memberId,
    isPublisher: account.member?.isPublisher ?? false,
    active: account.active,
    anonymizedAt: account.anonymizedAt,
    twoFactorEnabledAt: account.twoFactorEnabledAt,
    status: accountStatus({
      active: account.active,
      anonymized: account.anonymizedAt != null,
      passwordSet: isPasswordSet(account.password),
    }),
    roles: pageRoles,
    recordRoles: (account.member?.roleAssignments ?? [])
      .map(assignment => assignment.role)
      .filter(role => isIdentityRoleKey(role.key)),
  }
}
