import { describe, expect, it } from 'vitest'

import { Permission } from '~/shared/types/permission'

import { dashboardCreations } from './dashboard-creations'
import { type DashboardViewer, dashboardVisibility } from './dashboard-visibility'

const member: DashboardViewer['member'] = { publisherGroupId: 7, responsibleFor: null, deputyFor: null }

function creationsFor(permissions: Permission[], withRecord = true) {
  const granted = new Set(permissions)
  const visibility = dashboardVisibility({ permissions: granted, member: withRecord ? member : null })
  return dashboardCreations(visibility, granted).map(creation => creation.key)
}

describe('dashboardCreations', () => {
  it('offers a publisher with a record only their absence', () => {
    expect(creationsFor([Permission.CanViewBoard])).toEqual(['absence'])
  })

  it('offers nothing to an account without a record and without a right to create', () => {
    expect(creationsFor([Permission.CanViewBoard], false)).toEqual([])
  })

  it('adds each creation the viewer may make, in a fixed order', () => {
    expect(
      creationsFor([
        Permission.CanViewTerritoryAttributions,
        Permission.CanManageTerritoryAttributions,
        Permission.CanViewTerritories,
        Permission.CanViewPrograms,
        Permission.CanManagePrograms,
        Permission.CanViewBoard,
        Permission.CanUploadBoardDocuments,
        Permission.CanManageRoles,
      ]),
    ).toEqual(['absence', 'attribution', 'programme', 'board-document', 'role'])
  })

  it('never offers what the destination would refuse: managing programmes without seeing them', () => {
    expect(creationsFor([Permission.CanManagePrograms])).toEqual(['absence'])
  })
})
