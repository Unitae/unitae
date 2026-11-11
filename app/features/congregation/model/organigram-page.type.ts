// The organigram page's view of its data — client-safe, shared by the page's components and the server assembly in
// ../server/organigram-page.queries.ts and ../server/organigram-panel.server.ts.

import type { OrganigramNode } from '~/shared/domain/organigram.queries'

/** What a box of the organigram is, which decides what its panel offers. */
export type RoleKind =
  /** The elders' and assistants' lists, kept up to date from the records' flags. */
  | 'roster'
  /** The service committee, made of its three posts' titulaires. */
  | 'committee'
  /** One of the committee's three posts: one elder holds it. */
  | 'post'
  /** A team: responsables, adjoints and members. */
  | 'team'
  /** A personal role: one titulaire, adjoints allowed. */
  | 'personal'

export type SeatKind = 'leader' | 'deputy' | 'member'

export interface PanelSeat {
  memberId: number
  name: string
  seat: SeatKind
  isElder: boolean
}

export interface PanelRole {
  id: number
  name: string
  kind: RoleKind
  description: string | null
  /** Printed under the role on the board's organigram. */
  note: string | null
  /** A role the congregation created: its name, description, note and type are edited here, and it can be deleted. */
  editable: boolean
  /** The role exists without a box on the chart; it can be attached under a chart role. */
  offChart: boolean
  parent: { id: number; name: string } | null
  /** Its place among the roles under the same parent, from 1. */
  position: { index: number; of: number }
  children: { id: number; name: string }[]
  /** Who holds a seat: responsables and adjoints (titulaire and adjoints for a personal role), or a list's members. */
  seats: PanelSeat[]
  /** A team's plain members, edited in Équipes. */
  members: string[]
  /** Where it may move: every chart role except itself and those under it. */
  moveTargets: { id: number; label: string }[]
}

/** A role that exists outside the chart, offered when adding a role under another. */
export interface OffChartRole {
  id: number
  name: string
  holderCount: number
}

/** What a role taken over by a committee post brings with it: its leader, the roles under it, its permissions. */
export interface CandidateBrings {
  id: number
  name: string
  leader: string | null
  children: string[]
  permissionCount: number
}

export interface CommitteeTakeover {
  /** The three posts, each with the role that most likely fills it. */
  posts: { key: string; name: string; suggestedRoleId: number | null }[]
  candidates: CandidateBrings[]
}

export interface OrganigramManage {
  /** Everyone in the congregation who can be named, login or not. */
  people: { id: number; firstname: string | null; lastname: string | null }[]
  /** Who is not an elder: refused as a committee post's titulaire. */
  nonElderIds: number[]
  /** Roles outside the chart that can be attached under a role. */
  offChart: OffChartRole[]
  /** The elders' and assistants' lists when they are missing from the top. */
  rosters: { id: number; name: string }[]
  /** Every chart role, indented, for « place » pickers. */
  places: { id: number; label: string }[]
  committee: CommitteeTakeover | null
}

export interface OrganigramPage {
  tree: OrganigramNode[]
  panel: PanelRole | null
  /** The board's organigram document, when the congregation has one. */
  boardDocumentId: number | null
  manage: OrganigramManage | null
}
