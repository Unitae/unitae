import type { Member, PublisherGroup, UserAccount } from '~/database/generated/client'

// Member with the responsibleFor / deputyFor relations the session loader
// includes, so callers can read currentUser.member?.responsibleFor without
// extra type gymnastics.
export type MemberWithGroupRoles = Member & {
  responsibleFor: PublisherGroup | null
  deputyFor: PublisherGroup | null
}

// The session-loaded account, optionally including its linked Member.
export type AccountWithMember = UserAccount & { member: MemberWithGroupRoles | null }

// Strip the password before passing into request context.
export type SanitizedUser = Omit<AccountWithMember, 'password'>

export function sanitizeUser<T extends UserAccount>(user: T): Omit<T, 'password'> {
  const { password, ...sanitized } = user
  return sanitized
}
