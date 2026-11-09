import { describe, expect, it } from 'vitest'
import { Permission } from '~/shared/types/permission'
import {
  canCorrectAnyActivity,
  canManageGroupActivity,
  canRecordAnyActivity,
  reportAccess,
  reportPanelPath,
} from './group-activity-access'

const base = {
  hasActivityManager: false,
  responsibleId: 5,
  deputyId: null as number | null,
  myMemberId: null as number | null,
}

describe('canManageGroupActivity', () => {
  it('grants access to an activity manager regardless of group role', () => {
    expect(canManageGroupActivity({ ...base, hasActivityManager: true, myMemberId: 999 })).toBe(true)
  })

  it("grants access to the group's responsible (by member id)", () => {
    expect(canManageGroupActivity({ ...base, responsibleId: 5, myMemberId: 5 })).toBe(true)
  })

  it("grants access to the group's deputy (by member id)", () => {
    expect(canManageGroupActivity({ ...base, deputyId: 8, myMemberId: 8 })).toBe(true)
  })

  it('denies a user who is neither manager nor responsible/deputy', () => {
    expect(canManageGroupActivity({ ...base, responsibleId: 5, deputyId: 8, myMemberId: 9 })).toBe(false)
  })

  it('denies a user with no linked member (no member id to match on)', () => {
    // Regression guard: the check must run on the Member id, not a UserAccount
    // id — a user without a linked Member can never be the responsible/deputy.
    expect(canManageGroupActivity({ ...base, responsibleId: 5, myMemberId: null })).toBe(false)
  })
})

describe('canRecordAnyActivity', () => {
  // Regression: the activity forms accepted CanManagePublishers only, while the activity permission
  // showed the links to them.
  it('grants the activity permission', () => {
    expect(canRecordAnyActivity(new Set([Permission.CanRecordActivity]))).toBe(true)
  })

  it('still grants the publisher manager', () => {
    expect(canRecordAnyActivity(new Set([Permission.CanManagePublishers]))).toBe(true)
  })

  it('denies a mere viewer', () => {
    expect(canRecordAnyActivity(new Set([Permission.CanViewActivity, Permission.CanViewPublishers]))).toBe(false)
  })
})

// « Peut modifier et supprimer l'activité enregistrée »: changing a filed report is its own right.
describe('canCorrectAnyActivity', () => {
  it('grants the correction permission', () => {
    expect(canCorrectAnyActivity(new Set([Permission.CanCorrectActivity]))).toBe(true)
  })

  it('still grants the publisher manager', () => {
    expect(canCorrectAnyActivity(new Set([Permission.CanManagePublishers]))).toBe(true)
  })

  it('denies the permission to record new reports only', () => {
    expect(canCorrectAnyActivity(new Set([Permission.CanRecordActivity]))).toBe(false)
  })
})

describe('reportAccess', () => {
  const OVERSEER: { responsibleForId: number | null; deputyForId: number | null } = {
    responsibleForId: 9,
    deputyForId: null,
  }
  const access = (permissions: Permission[], leader: typeof OVERSEER | null, publisherGroupId: number | null) =>
    reportAccess({ permissions: new Set(permissions), leader, publisherGroupId })

  it("lets a group's overseer record and correct his own group's reports, without credit or delete", () => {
    expect(access([], OVERSEER, 9)).toEqual({
      canRecord: true,
      canCorrect: true,
      canGrantCredit: false,
      canDelete: false,
    })
  })

  it('lets the deputy do the same', () => {
    expect(access([], { responsibleForId: null, deputyForId: 9 }, 9).canCorrect).toBe(true)
  })

  it("refuses an overseer another group's reports, and a publisher without a group", () => {
    expect(access([], OVERSEER, 4)).toEqual({
      canRecord: false,
      canCorrect: false,
      canGrantCredit: false,
      canDelete: false,
    })
    expect(access([], OVERSEER, null).canRecord).toBe(false)
  })

  it('lets a recorder file any report but correct none', () => {
    const recorder = access([Permission.CanRecordActivity], null, 4)
    expect(recorder.canRecord).toBe(true)
    expect(recorder.canCorrect).toBe(false)
  })

  it('gives the secretary everything, credit and delete included', () => {
    expect(access([Permission.CanRecordActivity, Permission.CanCorrectActivity], null, 4)).toEqual({
      canRecord: true,
      canCorrect: true,
      canGrantCredit: true,
      canDelete: true,
    })
  })

  it('lets a publisher manager record and correct, without credit or delete', () => {
    expect(access([Permission.CanManagePublishers], null, 4)).toEqual({
      canRecord: true,
      canCorrect: true,
      canGrantCredit: false,
      canDelete: false,
    })
  })

  it('gives a viewer nothing to change', () => {
    expect(access([Permission.CanViewActivity], null, 4).canRecord).toBe(false)
  })
})

describe('reportPanelPath', () => {
  const month = { publisherId: 41, month: 9, year: 2026 }

  it('opens the report on the activity page for those who see the month', () => {
    expect(
      reportPanelPath({
        permissions: new Set([Permission.CanViewActivity]),
        leader: null,
        publisherGroupId: 4,
        ...month,
      }),
    ).toBe('/publishers/activity?open=41&month=9&year=2026')
  })

  it("opens it on the group page for the overseer of the publisher's group", () => {
    const leader = { responsibleForId: 9, deputyForId: null }
    expect(reportPanelPath({ permissions: new Set(), leader, publisherGroupId: 9, ...month })).toBe(
      '/groups/9/view?open=41&month=9&year=2026',
    )
    expect(reportPanelPath({ permissions: new Set(), leader, publisherGroupId: 4, ...month })).toBeNull()
  })
})
