import type { PanelNode } from '~/features/congregation/ui/OrganigramNodePanel'
import {
  isAppointedRoleKey,
  isServiceCommitteePostKey,
  SERVICE_COMMITTEE_KEY,
} from '~/shared/domain/built-in-roles.server'
import { descendantIds } from '~/shared/domain/organigram.queries'
import type { FlatEntry } from '~/shared/domain/organigram-layout'
import { canShowInOrganigram, ORGANIGRAM_ROSTER_KEYS } from '~/shared/domain/role-tree.policy'
import { getRoleDisplayName } from '~/shared/types/role'

// Pure assembly for the organigram page: flat entries in, panel shape and legal move targets
// out. Lives here rather than in the route loader so the flag wiring is testable without a
// request — and so the route stays within its size budget.

/** The panel's view of the selected node, with every behavioural flag resolved from the key. */
export function buildPanelNode(selected: FlatEntry): PanelNode {
  return {
    id: selected.node.id,
    name: selected.node.name,
    isRoster: selected.node.isRoster,
    // The committee and its posts are placed by provisioning and never move, so the panel
    // must not offer to move or remove them.
    isFixed: isAppointedRoleKey(selected.node.key),
    isPost: isServiceCommitteePostKey(selected.node.key),
    isCommittee: selected.node.key === SERVICE_COMMITTEE_KEY,
    isSinglePerson: selected.node.isSinglePerson,
    parentId: selected.parentId,
    parentName: selected.parentName,
    childCount: selected.node.children.length,
    holders: selected.node.holders.map(holder => ({
      memberId: holder.memberId,
      name: `${holder.firstname ?? ''} ${holder.lastname?.toLocaleUpperCase() ?? ''}`.trim() || '—',
      kind: holder.kind,
    })),
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
