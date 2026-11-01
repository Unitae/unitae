import { describe, expect, it } from 'vitest'
import { Permission } from '~/shared/types/permission'
import { canCorrectAnyActivity, canManageGroupActivity, canRecordAnyActivity } from './group-activity-access'

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
