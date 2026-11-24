import { describe, expect, it } from 'vitest'
import { scheduleTemplateSchema } from './schedule-template.schema'

describe('scheduleTemplateSchema', () => {
  it('reads a blank name and responsible as none', () => {
    expect(scheduleTemplateSchema.parse({ scheduleTemplateId: '7', name: '  ', responsibleRoleId: '' })).toEqual({
      scheduleTemplateId: 7,
      name: null,
      responsibleRoleId: null,
    })
  })

  it('keeps a name trimmed and a role id', () => {
    expect(
      scheduleTemplateSchema.parse({ scheduleTemplateId: 7, name: ' Services ', responsibleRoleId: '12' }),
    ).toEqual({
      scheduleTemplateId: 7,
      name: 'Services',
      responsibleRoleId: 12,
    })
  })

  it('refuses a template id that is not one', () => {
    expect(scheduleTemplateSchema.safeParse({ scheduleTemplateId: 'x' }).success).toBe(false)
  })
})
