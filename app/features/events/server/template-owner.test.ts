import { describe, expect, it } from 'vitest'
import { ownerData, ownerKind, ownerWhere } from './template-owner'

describe('a template item’s owner', () => {
  it('reads a kind’s items by the kind', () => {
    expect(ownerWhere(4)).toEqual({ templateId: 4 })
    expect(ownerData(4)).toEqual({ templateId: 4 })
    expect(ownerKind(4)).toBe(4)
  })

  it('reads a schedule template’s items as its kind’s in it, and a row its kind has not placed yet', () => {
    expect(ownerWhere({ scheduleTemplateId: 9, templateId: 4 })).toEqual({
      templateId: 4,
      OR: [{ scheduleTemplateId: 9 }, { scheduleTemplateId: null }],
    })
    expect(ownerData({ scheduleTemplateId: 9, templateId: 4 })).toEqual({ templateId: 4, scheduleTemplateId: 9 })
    expect(ownerKind({ scheduleTemplateId: 9, templateId: 4 })).toBe(4)
  })

  it('reads a schedule template no kind uses by it alone, its items filed under no kind', () => {
    expect(ownerWhere({ scheduleTemplateId: 9, templateId: null })).toEqual({ scheduleTemplateId: 9 })
    expect(ownerData({ scheduleTemplateId: 9, templateId: null })).toEqual({ templateId: null, scheduleTemplateId: 9 })
    expect(ownerKind({ scheduleTemplateId: 9, templateId: null })).toBeNull()
  })
})
