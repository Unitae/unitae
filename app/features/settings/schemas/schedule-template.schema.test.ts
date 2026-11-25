import { parseWithZod } from '@conform-to/zod/v4'
import { describe, expect, it } from 'vitest'
import { renameSectionSchema, scheduleTemplateSchema } from './schedule-template.schema'

// Through parseWithZod on a FormData, as the action reads it: conform turns a blank field into a missing one.
const parse = (fields: Record<string, string>) => {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.set(name, value)
  const submission = parseWithZod(form, { schema: scheduleTemplateSchema })
  return submission.status === 'success' ? submission.value : null
}

describe('scheduleTemplateSchema', () => {
  it('reads « none » as no responsible and a blank name as no name', () => {
    expect(parse({ scheduleTemplateId: '7', name: '  ', responsibleRoleId: 'none' })).toEqual({
      scheduleTemplateId: 7,
      name: null,
      responsibleRoleId: null,
    })
  })

  it('leaves the responsible alone when the post leaves it out', () => {
    expect(parse({ scheduleTemplateId: '7', name: 'Services' })).toEqual({
      scheduleTemplateId: 7,
      name: 'Services',
      responsibleRoleId: undefined,
    })
    expect(parse({ scheduleTemplateId: '7', name: 'Services', responsibleRoleId: '' })?.responsibleRoleId).toBe(
      undefined,
    )
  })

  it('keeps a name trimmed and a role id', () => {
    expect(parse({ scheduleTemplateId: '7', name: ' Services ', responsibleRoleId: '12' })).toEqual({
      scheduleTemplateId: 7,
      name: 'Services',
      responsibleRoleId: 12,
    })
  })

  it('refuses a name over 80 characters, and ids that are not positive whole numbers', () => {
    expect(parse({ scheduleTemplateId: '7', name: 'x'.repeat(81) })).toBeNull()
    const form = new FormData()
    form.set('scheduleTemplateId', '7')
    form.set('name', 'x'.repeat(81))
    expect(parseWithZod(form, { schema: scheduleTemplateSchema }).reply().error?.name).toEqual([
      'Le nom : 80 caractères au plus.',
    ])
    expect(parse({ scheduleTemplateId: '7', name: 'x'.repeat(80) })).not.toBeNull()
    for (const id of ['x', '0', '-3', '1.5']) {
      expect(parse({ scheduleTemplateId: id })).toBeNull()
      expect(parse({ scheduleTemplateId: '7', responsibleRoleId: id })).toBeNull()
    }
  })
})

describe('the section rename schema', () => {
  const read = (schema: typeof renameSectionSchema, fields: Record<string, string>) => {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) form.set(name, value)
    const submission = parseWithZod(form, { schema })
    return submission.status === 'success' ? submission.value : null
  }

  it('reads a section’s rename, trimmed, and refuses a blank or too long name', () => {
    expect(read(renameSectionSchema, { intent: 'rename-section', from: 'Joyaux', to: '  Perles  ' })).toEqual({
      intent: 'rename-section',
      from: 'Joyaux',
      to: 'Perles',
    })
    expect(read(renameSectionSchema, { intent: 'rename-section', from: 'Joyaux', to: '   ' })).toBeNull()
    expect(read(renameSectionSchema, { intent: 'rename-section', from: 'Joyaux', to: 'x'.repeat(81) })).toBeNull()
    expect(read(renameSectionSchema, { intent: 'rename-section', to: 'Perles' })).toBeNull()
  })
})
