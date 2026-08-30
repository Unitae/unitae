// The matrix page's view of its data — client-safe, so the table and card components can share
// it with the server assembly in ../server/role-matrix.server.ts without importing server code.

export interface MatrixColumn {
  id: number
  name: string
  /** Personal roles render as read-only seats linking to the organigram, never as toggles. */
  isSinglePerson: boolean
}

export interface MatrixGroup {
  /** A committee post key, or the two synthetic bands `others` / `off-chart`. */
  key: string
  /** The post's display name; null for the synthetic bands, which the UI labels itself. */
  label: string | null
  columns: MatrixColumn[]
  /** Folded by the reader — the band renders as one narrow column until reopened. */
  collapsed: boolean
}

export interface MatrixMember {
  id: number
  firstname: string | null
  lastname: string | null
  /** Eligibility is account-bound; a member without a login shows greyed with the reason. */
  hasAccount: boolean
  /** roleId → seat kind, for every custom role the member holds. */
  seats: Record<number, string>
}
