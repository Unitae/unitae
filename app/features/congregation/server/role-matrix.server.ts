import { isServiceCommitteePostKey, SERVICE_COMMITTEE_POST_KEYS } from '~/shared/domain/built-in-roles.server'
import { getRoleDisplayName } from '~/shared/types/role'

// The matrix's columns, banded by who answers for them.
//
// Each committee post heads the services in its branch of the organigram — the printed sheet's
// « sous la responsabilité du coordinateur » — chart roles outside every post branch land in
// « others », and roles outside the chart close the table.
//
// Only the chart's LEAVES become columns. The matrix edits plain members, members live on the
// teams, and upper levels carry responsables/adjoints — seats the organigram changes and this
// grid may not: a column of read-only cells earns no width. Personal roles are out for the
// same reason. The band header carries the structure the hidden levels used to show. The one
// exception is a role still holding plain members from before this model — its column stays
// until emptied so no membership ever becomes invisible, then disappears on its own.

export type { MatrixColumn, MatrixGroup } from '~/features/congregation/model/role-matrix.type'

import type { MatrixColumn, MatrixGroup } from '~/features/congregation/model/role-matrix.type'

export interface MatrixRoleRow {
  id: number
  key: string
  name: string | null
  isBuiltIn: boolean
  isSinglePerson: boolean
  showInOrganigram: boolean
  parentRoleId: number | null
  organigramOrder: number | null
}

function compareRows(a: MatrixRoleRow, b: MatrixRoleRow): number {
  const order = (a.organigramOrder ?? 0) - (b.organigramOrder ?? 0)
  if (order !== 0) return order
  return getRoleDisplayName(a).localeCompare(getRoleDisplayName(b))
}

export function buildMatrixGroups(
  roles: MatrixRoleRow[],
  collapsedKeys: ReadonlySet<string>,
  /** Roles with at least one plain `member` seat — the legacy escape hatch described above. */
  rolesWithPlainMembers: ReadonlySet<number>,
): MatrixGroup[] {
  const byId = new Map(roles.map(row => [row.id, row]))
  const chart = roles.filter(row => row.showInOrganigram)
  const chartIds = new Set(chart.map(row => row.id))
  const chartParents = new Set(
    chart.filter(row => row.parentRoleId != null && chartIds.has(row.parentRoleId)).map(row => row.parentRoleId),
  )

  const isColumn = (row: MatrixRoleRow): boolean => {
    if (rolesWithPlainMembers.has(row.id)) return true
    if (row.isSinglePerson) return false
    if (!row.showInOrganigram) return true
    return !chartParents.has(row.id)
  }

  const childrenOf = new Map<number, MatrixRoleRow[]>()
  const roots: MatrixRoleRow[] = []
  for (const row of chart) {
    // A parent absent from the chart promotes the child to a root, exactly as the tree renders it.
    if (row.parentRoleId == null || !chartIds.has(row.parentRoleId)) roots.push(row)
    else childrenOf.set(row.parentRoleId, [...(childrenOf.get(row.parentRoleId) ?? []), row])
  }

  // Preorder, cycle-safe: the policy prevents cycles on write, but a hand-edited database must
  // not lose columns — anything a root cannot reach is walked afterwards, like the tree does.
  const preorder: MatrixRoleRow[] = []
  const visited = new Set<number>()
  const walk = (row: MatrixRoleRow) => {
    if (visited.has(row.id)) return
    visited.add(row.id)
    preorder.push(row)
    for (const child of (childrenOf.get(row.id) ?? []).sort(compareRows)) walk(child)
  }
  for (const root of roots.sort(compareRows)) walk(root)
  for (const row of chart.slice().sort(compareRows)) walk(row)

  /** The committee post this row reports under, however deep — or nothing. */
  const branchOf = (row: MatrixRoleRow): string | null => {
    const seen = new Set<number>()
    let current: MatrixRoleRow | undefined = row
    while (current && !seen.has(current.id)) {
      if (isServiceCommitteePostKey(current.key)) return current.key
      seen.add(current.id)
      current = current.parentRoleId == null ? undefined : byId.get(current.parentRoleId)
    }
    return null
  }

  const toColumn = (row: MatrixRoleRow): MatrixColumn => ({
    id: row.id,
    name: getRoleDisplayName(row),
    isSinglePerson: row.isSinglePerson,
  })

  const groups: MatrixGroup[] = []
  const push = (key: string, label: string | null, columns: MatrixColumn[]) => {
    if (columns.length === 0) return
    groups.push({ key, label, columns, collapsed: collapsedKeys.has(key) })
  }

  const customPreorder = preorder.filter(row => !row.isBuiltIn && isColumn(row))
  for (const postKey of SERVICE_COMMITTEE_POST_KEYS) {
    const post = roles.find(row => row.key === postKey)
    push(
      postKey,
      post ? getRoleDisplayName(post) : postKey,
      customPreorder.filter(row => branchOf(row) === postKey).map(toColumn),
    )
  }
  push('others', null, customPreorder.filter(row => branchOf(row) == null).map(toColumn))
  push(
    'off-chart',
    null,
    roles
      .filter(row => !row.isBuiltIn && !row.showInOrganigram && isColumn(row))
      .sort((a, b) => getRoleDisplayName(a).localeCompare(getRoleDisplayName(b)))
      .map(toColumn),
  )

  return groups
}
