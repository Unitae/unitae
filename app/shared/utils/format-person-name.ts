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
