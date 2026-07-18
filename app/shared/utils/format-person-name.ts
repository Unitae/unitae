type PersonNameParts = {
  firstname: string | null | undefined
  lastname: string | null | undefined
}

export function formatPersonName(person: PersonNameParts, fallback = '—'): string {
  const first = person.firstname?.trim()
  const last = person.lastname?.trim().toLocaleUpperCase('fr')

  if (first && last) return `${first} ${last}`
  if (first) return first
  if (last) return last
  return fallback
}

export function comparePersonName(a: PersonNameParts, b: PersonNameParts): number {
  const lastDiff = (a.lastname ?? '').localeCompare(b.lastname ?? '', 'fr', { sensitivity: 'base' })
  if (lastDiff !== 0) return lastDiff
  return (a.firstname ?? '').localeCompare(b.firstname ?? '', 'fr', { sensitivity: 'base' })
}

type AccountWithMember = {
  firstname: string | null
  lastname: string | null
  member: { firstname: string | null; lastname: string | null } | null
}

// When a UserAccount is linked to a Member, the Member owns the name and
// account.firstname/lastname stay null. Fall back to the account's own name
// (used for accounts without a linked Member, e.g. seed admins).
export function resolveAccountName(account: AccountWithMember): { firstname: string | null; lastname: string | null } {
  return {
    firstname: account.member?.firstname ?? account.firstname,
    lastname: account.member?.lastname ?? account.lastname,
  }
}
