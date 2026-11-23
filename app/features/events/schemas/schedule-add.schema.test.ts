import { describe, expect, it } from 'vitest'
import { scheduleAddSchema } from './schedule-add.schema'

describe('scheduleAddSchema', () => {
  it('reads a template, or a name and a kind, and nothing else', () => {
    expect(scheduleAddSchema.parse({ scheduleTemplateId: '12' })).toEqual({ scheduleTemplateId: 12 })
    expect(scheduleAddSchema.parse({ name: ' Repas ', kind: 'duty' })).toEqual({ name: 'Repas', kind: 'duty' })
    expect(scheduleAddSchema.safeParse({ name: 'Repas', kind: 'other' }).success).toBe(false)
    expect(scheduleAddSchema.safeParse({ name: '  ', kind: 'duty' }).success).toBe(false)
  })
})
