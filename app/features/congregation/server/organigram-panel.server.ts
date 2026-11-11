import type { PanelRole, RoleKind, SeatKind } from '~/features/congregation/model/organigram-page.type'
import {
  isAppointedRoleKey,
  isServiceCommitteePostKey,
  SERVICE_COMMITTEE_KEY,
} from '~/shared/domain/built-in-roles.server'
import { descendantIds, type OrganigramNode } from '~/shared/domain/organigram.queries'
import type { FlatEntry } from '~/shared/domain/organigram-layout'
import { canShowInOrganigram, ORGANIGRAM_ROSTER_KEYS } from '~/shared/domain/role-tree.policy'
import { getRoleDisplayName } from '~/shared/types/role'

// Pure assembly for the organigram page: flat entries in, panel shape and legal move targets
// out. Lives here rather than in the route loader so the flag wiring is testable without a
// request — and so the route stays within its size budget.

const personName = (holder: { firstname: string | null; lastname: string | null }) =>
  `${holder.firstname ?? ''} ${holder.lastname?.toLocaleUpperCase() ?? ''}`.trim() || '—'

function roleKind(node: FlatEntry['node']): RoleKind {
  if (node.isRoster) return 'roster'
  if (node.key === SERVICE_COMMITTEE_KEY) return 'committee'
  if (isServiceCommitteePostKey(node.key)) return 'post'
  return node.isSinglePerson ? 'personal' : 'team'
}

/**
 * The panel of the role at `index` in the flattened chart: what it is, who sits in it and who is only a member, where
 * it stands, what may move it. `details` are the role's own fields the chart does not carry.
 */
export function buildRolePanel(
  flat: FlatEntry[],
  index: number,
  details: { description: string | null; isBuiltIn: boolean },
): PanelRole {
  const entry = flat[index] as FlatEntry
  const siblings = flat.filter(other => other.parentId === entry.parentId)
  return {
    ...people(entry.node),
    description: details.description,
    editable: !details.isBuiltIn,
    offChart: false,
    parent: entry.parentId != null && entry.parentName != null ? { id: entry.parentId, name: entry.parentName } : null,
    position: { index: siblings.findIndex(other => other.id === entry.id) + 1, of: siblings.length },
    children: entry.node.children.map(child => ({ id: child.id, name: child.name })),
    moveTargets: buildMoveTargets(flat, entry),
  }
}

/** What a role is and who holds it — the same on the chart and off it. */
function people(node: OrganigramNode) {
  const kind = roleKind(node)
  // A list's people and the committee's are its members; elsewhere only responsables and adjoints hold a seat.
  const listed = kind === 'roster' || kind === 'committee'
  const seated = node.holders.filter(holder => listed || holder.kind === 'leader' || holder.kind === 'deputy')
  return {
    id: node.id,
    name: node.name,
    kind,
    note: node.note,
    seats: seated.map(holder => ({
      memberId: holder.memberId,
      name: personName(holder),
      seat: listed ? 'member' : (holder.kind as SeatKind),
      isElder: holder.isElder,
    })),
    members: listed ? [] : node.holders.filter(holder => holder.kind === 'member').map(personName),
  }
}

/**
 * The panel of a role outside the chart, opened from Équipes or right after its creation: its people, its definition,
 * and every chart role as a place to attach it.
 */
export function buildOffChartPanel(
  node: OrganigramNode,
  details: { description: string | null; isBuiltIn: boolean },
  places: { id: number; label: string }[],
): PanelRole {
  return {
    ...people(node),
    description: details.description,
    editable: !details.isBuiltIn,
    offChart: true,
    parent: null,
    position: { index: 1, of: 1 },
    children: [],
    moveTargets: places,
  }
}

/**
 * What each picker on the page may offer, from the off-chart roles.
 *
 * `adoptable` feeds the panel's attach select: plain services only. Appointed posts pass
 * `canShowInOrganigram` but hold a fixed place, and the rosters may only sit at the top — the
 * service refuses to attach either under a node, so offering them would be offering an error.
 * `rosters` feeds the recovery form that puts a list back at the top of the chart.
 */
export function buildRolePickers(roles: { id: number; key: string; name: string | null }[]): {
  adoptable: { id: number; name: string }[]
  rosters: { id: number; name: string }[]
} {
  const toOption = (role: { id: number; key: string; name: string | null }) => ({
    id: role.id,
    name: getRoleDisplayName(role),
  })
  return {
    adoptable: roles
      .filter(
        role =>
          canShowInOrganigram(role.key) && !isAppointedRoleKey(role.key) && !ORGANIGRAM_ROSTER_KEYS.includes(role.key),
      )
      .map(toOption),
    rosters: roles.filter(role => ORGANIGRAM_ROSTER_KEYS.includes(role.key)).map(toOption),
  }
}

/**
 * Where the selected node may legally be moved: every chart node except itself and its
 * descendants — offering a descendant and then refusing it after a page reload teaches the
 * cycle rule far less kindly.
 */
export function buildMoveTargets(flat: FlatEntry[], selected: FlatEntry | undefined): { id: number; label: string }[] {
  const links = flat.map(fEntry => ({ id: fEntry.id, parentRoleId: fEntry.parentId }))
  const forbidden = selected ? new Set([selected.id, ...descendantIds(links, selected.id)]) : new Set<number>()
  return flat.filter(fEntry => !forbidden.has(fEntry.id)).map(({ id, label }) => ({ id, label }))
}
