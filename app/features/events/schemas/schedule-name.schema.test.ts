import { describe, expect, it } from 'vitest'
import { SCHEDULE_NAME_MAX, scheduleNameSchema } from './schedule-name.schema'

describe('scheduleNameSchema', () => {
  it('keeps a trimmed name, and refuses an empty or overlong one', () => {
    expect(scheduleNameSchema.parse({ name: '  Accueil et sono ' })).toEqual({ name: 'Accueil et sono' })
    expect(scheduleNameSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(scheduleNameSchema.safeParse({ name: 'x'.repeat(SCHEDULE_NAME_MAX + 1) }).success).toBe(false)
  })
})
