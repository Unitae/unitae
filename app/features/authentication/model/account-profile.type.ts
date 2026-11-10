export interface PersonName {
  firstname: string | null
  lastname: string | null
}

/** What « Mon compte › Profil » says about the signed-in person. */
export interface AccountProfile extends PersonName {
  email: string
  /** `publisher` / `not-publisher` for an account linked to a record, `none` for an account on its own. */
  record: 'publisher' | 'not-publisher' | 'none'
  /**
   * The record's preaching group, and whom to tell when something on the record is wrong: its overseer, or no one
   * in particular (`null`) when the person leads the group themselves.
   */
  group: { name: string; overseer: PersonName | null } | null
}
