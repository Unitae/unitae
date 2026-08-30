import type { PanelNode } from '~/features/congregation/ui/OrganigramNodePanel'
import {
  isAppointedRoleKey,
  isServiceCommitteePostKey,
  SERVICE_COMMITTEE_KEY,
} from '~/shared/domain/built-in-roles.server'
import { descendantIds } from '~/shared/domain/organigram.queries'
import type { FlatEntry } from '~/shared/domain/organigram-layout'

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
 * Where the selected node may legally be moved: every chart node except itself and its
 * descendants — offering a descendant and then refusing it after a page reload teaches the
 * cycle rule far less kindly.
 */
export function buildMoveTargets(flat: FlatEntry[], selected: FlatEntry | undefined): { id: number; label: string }[] {
  const links = flat.map(fEntry => ({ id: fEntry.id, parentRoleId: fEntry.parentId }))
  const forbidden = selected ? new Set([selected.id, ...descendantIds(links, selected.id)]) : new Set<number>()
  return flat.filter(fEntry => !forbidden.has(fEntry.id)).map(({ id, label }) => ({ id, label }))
}
