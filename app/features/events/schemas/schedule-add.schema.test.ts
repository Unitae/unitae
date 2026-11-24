import { describe, expect, it } from 'vitest'
import { scheduleAddSchema } from './schedule-add.schema'

describe('scheduleAddSchema', () => {
  it('reads a template, or a name and a kind', () => {
    expect(scheduleAddSchema.parse({ scheduleTemplateId: '12' })).toEqual({ scheduleTemplateId: 12 })
    expect(scheduleAddSchema.parse({ name: ' Repas ', kind: 'duty' })).toEqual({ name: 'Repas', kind: 'duty' })
  })

  it('refuses an unknown kind, a blank name, and a template beside a name', () => {
    expect(scheduleAddSchema.safeParse({ name: 'Repas', kind: 'other' }).success).toBe(false)
    expect(scheduleAddSchema.safeParse({ name: '  ', kind: 'duty' }).success).toBe(false)
    expect(scheduleAddSchema.safeParse({ scheduleTemplateId: '12', name: 'Repas', kind: 'duty' }).success).toBe(false)
    expect(scheduleAddSchema.safeParse({ scheduleTemplateId: 'abc', name: 'Repas', kind: 'duty' }).success).toBe(false)
  })
})
