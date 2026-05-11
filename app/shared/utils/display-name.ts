// Resolve a display name for a person.
//
// Members carry the canonical name. Accounts carry a fallback name only used
// when there's no Member (admin / circuit overseer). When both exist, the
// Member wins — accounts that link to a Member don't store name fields.

interface NameSource {
  firstname?: string | null
  lastname?: string | null
}

interface AccountWithOptionalMember {
  firstname?: string | null
  lastname?: string | null
  member?: NameSource | null
}

export function fullName(source: NameSource): string {
  const first = source.firstname ?? ''
  const last = source.lastname ?? ''
  return `${first} ${last}`.trim()
}

export function accountDisplayName(account: AccountWithOptionalMember): string {
  return fullName(account.member ?? account)
}
