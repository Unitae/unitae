/** Where an account stands, for the users list and the account page. */
export type AccountStatus = 'active' | 'invited' | 'deactivated' | 'anonymized'

export interface AccountStatusFacts {
  active: boolean
  anonymized: boolean
  /** The account chose a password, i.e. it followed its invitation. */
  passwordSet: boolean
}

/** Anonymised first (it is also switched off), then switched off, then still waiting for its invitation to be followed. */
export function accountStatus({ active, anonymized, passwordSet }: AccountStatusFacts): AccountStatus {
  if (anonymized) return 'anonymized'
  if (!active) return 'deactivated'
  if (!passwordSet) return 'invited'
  return 'active'
}
