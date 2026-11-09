import { describe, expect, it } from 'vitest'
import { Permission } from '~/shared/types/permission'

import { memberBackPath, memberPanelPath } from './_member-back-path.server'

const MEMBER_ID = 6612
const GROUP_ID = 2207
const inGroup = { id: MEMBER_ID, publisherGroupId: GROUP_ID }
const ungrouped = { id: MEMBER_ID, publisherGroupId: null }

const page = (search = '') => new Request(`https://demo.unitae.test/publishers/${MEMBER_ID}/emergency${search}`)
const viewer = new Set([Permission.CanViewPublishers])
const overseer = new Set<Permission>()

describe('memberBackPath', () => {
  it("leads a publisher viewer back to the member's record", () => {
    expect(memberBackPath(page(), viewer, inGroup)).toBe(`/publishers/${MEMBER_ID}/view`)
  })

  it('leads back to the group page when the group page opened it', () => {
    expect(memberBackPath(page('?from=group'), viewer, inGroup)).toBe(`/groups/${GROUP_ID}/view`)
  })

  it('leads an overseer who may not open records back to the group page', () => {
    expect(memberBackPath(page(), overseer, inGroup)).toBe(`/groups/${GROUP_ID}/view`)
  })

  it('falls back to the record, or home, for a member outside any group', () => {
    expect(memberBackPath(page('?from=group'), viewer, ungrouped)).toBe(`/publishers/${MEMBER_ID}/view`)
    expect(memberBackPath(page(), overseer, ungrouped)).toBe('/')
  })
})

describe('memberPanelPath', () => {
  it('opens the panel on the record, or on the group page for that member', () => {
    expect(memberPanelPath(page(), viewer, inGroup, 'emergency')).toBe(`/publishers/${MEMBER_ID}/view?panel=emergency`)
    expect(memberPanelPath(page(), overseer, inGroup, 'visit')).toBe(`/groups/${GROUP_ID}/view?visit=${MEMBER_ID}`)
  })

  it('leads home, with nothing to open, when neither page is the reader’s', () => {
    expect(memberPanelPath(page(), overseer, ungrouped, 'emergency')).toBe('/')
  })
})
