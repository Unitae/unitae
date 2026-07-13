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

// Firstname alone, following the same Member-wins rule as accountDisplayName.
// Returns null when neither source has a usable firstname — callers use `?? undefined`
// so React Email templates fall back to their default (usually the email address).
export function displayFirstname(account: AccountWithOptionalMember): string | null {
  const memberName = account.member?.firstname?.trim()
  if (memberName) return memberName
  const accountName = account.firstname?.trim()
  if (accountName) return accountName
  return null
}
