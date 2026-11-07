import { describe, expect, it } from 'vitest'

import { Permission } from '~/shared/types/permission'

import { type DashboardViewer, dashboardVisibility } from './dashboard-visibility'

// One case per person the dashboard serves. Together they are the « who sees what » table: a
// block is null when the viewer holds no responsibility for it, and every action it offers is
// one the destination page would accept.

const member = (overrides: Partial<NonNullable<DashboardViewer['member']>> = {}): DashboardViewer['member'] => ({
  publisherGroupId: 7,
  responsibleFor: null,
  deputyFor: null,
  ...overrides,
})

function viewer(permissions: Permission[], memberRecord: DashboardViewer['member'] = member()): DashboardViewer {
  return { permissions: new Set(permissions), member: memberRecord }
}

describe('dashboardVisibility', () => {
  it('gives a publisher with board access their own blocks, the meeting as it is on the board, and documents', () => {
    const v = dashboardVisibility(viewer([Permission.CanViewBoard]))
    expect(v.personal).toBe(true)
    expect(v.meetingAudience).toBe('board')
    expect(v.documents).toEqual({ canUpload: false })
    expect(v.responsibleConflicts).toBe(false)
    expect(v.programmes).toBeNull()
    expect(v.territories).toBeNull()
    expect(v.activity).toBeNull()
    expect(v.roll).toBeNull()
    expect(v.group).toBeNull()
    expect(v.setup).toBe(false)
    expect(v.suggestTwoFactor).toBe(false)
  })

  it('gives an account without a member record and without rights nothing but its absences', () => {
    const v = dashboardVisibility(viewer([], null))
    expect(v.personal).toBe(false)
    expect(v.meetingAudience).toBeNull()
    expect(v.documents).toBeNull()
  })

  it("gives a group overseer his group's block, with report entry when he belongs to that group", () => {
    const v = dashboardVisibility(viewer([Permission.CanViewBoard], member({ responsibleFor: { id: 7 } })))
    expect(v.group).toEqual({ groupId: 7, canRecord: true })
    // His group is his responsibility; the congregation's figures are not.
    expect(v.territories).toBeNull()
    expect(v.roll).toBeNull()
    expect(v.activity).toBeNull()
  })

  it('gives the assistant the same block, and no report entry for a group he is not part of', () => {
    expect(dashboardVisibility(viewer([], member({ deputyFor: { id: 7 } }))).group).toEqual({
      groupId: 7,
      canRecord: true,
    })
    expect(dashboardVisibility(viewer([], member({ responsibleFor: { id: 9 }, publisherGroupId: 7 }))).group).toEqual({
      groupId: 9,
      canRecord: false,
    })
  })

  it('lets anyone who records activity enter reports from the group block', () => {
    const v = dashboardVisibility(
      viewer([Permission.CanRecordActivity], member({ responsibleFor: { id: 9 }, publisherGroupId: 7 })),
    )
    expect(v.group).toEqual({ groupId: 9, canRecord: true })
  })

  it('gives the territory servant the territory figures and the assign shortcut, nothing about publishers', () => {
    const v = dashboardVisibility(
      viewer([
        Permission.CanViewTerritories,
        Permission.CanViewTerritoryAttributions,
        Permission.CanManageTerritoryAttributions,
        Permission.CanViewPublishers,
      ]),
    )
    expect(v.territories).toEqual({ canAssign: true })
    expect(v.roll).toBeNull()
    expect(v.activity).toBeNull()
    expect(v.suggestTwoFactor).toBe(true)
  })

  it('hides territory figures from someone the territories area would turn away', () => {
    expect(dashboardVisibility(viewer([Permission.CanViewTerritoryAttributions])).territories).toBeNull()
  })

  it('does not offer to assign territories on the strength of managing the territory list', () => {
    const v = dashboardVisibility(
      viewer([Permission.CanViewTerritories, Permission.CanViewTerritoryAttributions, Permission.CanManageTerritories]),
    )
    expect(v.territories).toEqual({ canAssign: false })
  })

  it('gives the secretary the activity block, with links only where the publishers area lets him in', () => {
    const withPublishers = dashboardVisibility(
      viewer([Permission.CanViewActivity, Permission.CanRecordActivity, Permission.CanViewPublishers]),
    )
    expect(withPublishers.activity).toEqual({ canRecord: true, canOpenPioneers: true, canOpenPublisher: true })

    const activityOnly = dashboardVisibility(viewer([Permission.CanViewActivity]))
    expect(activityOnly.activity).toEqual({ canRecord: false, canOpenPioneers: false, canOpenPublisher: false })
  })

  it('gives the roll to those who manage publishers and may enter their area', () => {
    expect(dashboardVisibility(viewer([Permission.CanManagePublishers, Permission.CanViewPublishers])).roll).toEqual({
      canCreate: true,
    })
    expect(dashboardVisibility(viewer([Permission.CanManagePublishers])).roll).toBeNull()
    expect(dashboardVisibility(viewer([Permission.CanViewPublishers])).roll).toBeNull()
  })

  it('gives the programme coordinator the programme block, its conflicts and the create shortcut', () => {
    const v = dashboardVisibility(
      viewer([Permission.CanViewPrograms, Permission.CanManagePrograms, Permission.CanAssignProgramParts]),
    )
    expect(v.meetingAudience).toBe('programmes')
    expect(v.programmes).toEqual({ canCreate: true })
    expect(v.responsibleConflicts).toBe(true)
  })

  it('lets a programme viewer see the meeting even without board access', () => {
    expect(dashboardVisibility(viewer([Permission.CanViewPrograms])).meetingAudience).toBe('programmes')
  })

  it('offers document upload only with the upload right', () => {
    expect(
      dashboardVisibility(viewer([Permission.CanViewBoard, Permission.CanUploadBoardDocuments])).documents,
    ).toEqual({ canUpload: true })
  })

  it('gives the administrator every block and the setup checklist', () => {
    const v = dashboardVisibility(viewer(Object.values(Permission), member({ responsibleFor: { id: 7 } })))
    expect(v.setup).toBe(true)
    expect(v.meetingAudience).toBe('programmes')
    expect(v.programmes).toEqual({ canCreate: true })
    expect(v.territories).toEqual({ canAssign: true })
    expect(v.activity).toEqual({ canRecord: true, canOpenPioneers: true, canOpenPublisher: true })
    expect(v.roll).toEqual({ canCreate: true })
    expect(v.group).toEqual({ groupId: 7, canRecord: true })
    expect(v.documents).toEqual({ canUpload: true })
  })
})
