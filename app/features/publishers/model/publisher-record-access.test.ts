import { describe, expect, it } from 'vitest'
import { Permission } from '~/shared/types/permission'

import { publisherRecordRights, type RecordViewer } from './publisher-record-access'

// Who sees and does what on a publisher's record. Each block follows the right of the page it comes from, so the
// record never shows more than those pages would.

const NORD = 3
const person = { id: 12, groupId: NORD }
const nobody: RecordViewer = { memberId: null, responsibleForId: null, deputyForId: null }

function rights(permissions: Permission[], viewer = nobody) {
  return publisherRecordRights(new Set(permissions), person, viewer)
}

describe('publisherRecordRights', () => {
  it('gives a reader of publishers the person and nothing from other areas', () => {
    expect(rights([Permission.CanViewPublishers])).toMatchObject({
      canEdit: false,
      canManageLifecycle: false,
      canManageLogin: false,
      canDownloadS21: false,
      canViewActivity: false,
      canSeeEnrolments: false,
      canViewAttributions: false,
      canViewPrograms: false,
      canViewAbsences: false,
      canViewEmergency: false,
      canRecordVisit: false,
    })
  })

  it('shows the territories to those who see attributions, the link to those who see territories', () => {
    expect(rights([Permission.CanViewPublishers, Permission.CanViewTerritoryAttributions])).toMatchObject({
      canViewAttributions: true,
      canOpenTerritories: false,
    })
    expect(rights([Permission.CanViewPublishers, Permission.CanViewTerritories]).canViewAttributions).toBe(false)
  })

  it('follows the status routes, not the right to edit, for the status menu', () => {
    expect(rights([Permission.CanViewPublishers, Permission.CanManagePublishers])).toMatchObject({
      canEdit: true,
      canManageLogin: true,
      canManageLifecycle: false,
    })
    expect(rights([Permission.CanViewPublishers, Permission.CanManagePublisherLifecycle]).canManageLifecycle).toBe(true)
  })

  it('offers the S-21 to whoever may record activity, as its route does', () => {
    expect(rights([Permission.CanViewPublishers, Permission.CanRecordActivity]).canDownloadS21).toBe(true)
  })

  it('lists the enrolments for readers of activity and for managers, who alone change them', () => {
    expect(rights([Permission.CanViewPublishers, Permission.CanViewActivity])).toMatchObject({
      canViewActivity: true,
      canSeeEnrolments: true,
      canManageEnrolments: false,
    })
    expect(rights([Permission.CanViewPublishers, Permission.CanManagePublishers])).toMatchObject({
      canViewActivity: false,
      canSeeEnrolments: true,
      canManageEnrolments: true,
    })
  })

  it('lets the group’s leaders see and keep the emergency info and the visits of their own group', () => {
    const overseer = { memberId: 5, responsibleForId: NORD, deputyForId: null }
    expect(rights([Permission.CanViewPublishers], overseer)).toMatchObject({
      canViewEmergency: true,
      canManageEmergency: true,
      canRecordVisit: true,
    })
    const elsewhere = { memberId: 6, responsibleForId: 9, deputyForId: null }
    expect(rights([Permission.CanViewPublishers], elsewhere)).toMatchObject({
      canViewEmergency: false,
      canRecordVisit: false,
    })
  })

  it('knows a reader is on their own record, where they may not change their own status', () => {
    expect(rights([Permission.CanManagePublisherLifecycle], { ...nobody, memberId: 12 }).isSelf).toBe(true)
  })
})
