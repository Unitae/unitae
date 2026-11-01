import { parseWithZod } from '@conform-to/zod/v4'
import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/messages', () => ({
  groups_form_error_name_required: () => 'name required',
  groups_form_error_address_required: () => 'address required',
  groups_form_error_responsible_required: () => 'overseer required',
  groups_form_error_same_person: () => 'same person',
}))

const { createGroupSchema } = await import('./group.schema')

// What the form posts: Conform turns an empty field into a missing one, as on the real form.
function submit(fields: Record<string, string>) {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return parseWithZod(formData, { schema: createGroupSchema })
}

function errors(fields: Record<string, string>) {
  const submission = submit(fields)
  return submission.status === 'success' ? undefined : submission.error
}

describe('createGroupSchema', () => {
  it('reads a complete form', () => {
    const submission = submit({ name: ' Nord ', address: '1 rue', responsible: '4', deputy: '5' })

    expect(submission.status).toBe('success')
    expect(submission.status === 'success' && submission.value).toEqual({
      name: 'Nord',
      address: '1 rue',
      responsible: 4,
      deputy: 5,
    })
  })

  it('reads an empty deputy as none', () => {
    const submission = submit({ name: 'Nord', address: '1 rue', responsible: '4', deputy: '' })

    expect(submission.status === 'success' && submission.value.deputy).toBeUndefined()
  })

  // Regression: the form showed Zod's own English messages, such as
  // "Invalid input: expected number, received NaN".
  it('explains each missing field in the app language', () => {
    expect(errors({ name: '', address: '', responsible: '', deputy: '' })).toEqual({
      name: ['name required'],
      address: ['address required'],
      responsible: ['overseer required'],
    })
  })

  it('treats a blank name as missing', () => {
    expect(errors({ name: '   ', address: '1 rue', responsible: '4' })).toEqual({ name: ['name required'] })
  })

  // Regression: the rule lived in the route action only, which redirected and lost the form.
  it('refuses the same person as overseer and deputy, on the deputy field', () => {
    expect(errors({ name: 'Nord', address: '1 rue', responsible: '4', deputy: '4' })).toEqual({
      deputy: ['same person'],
    })
  })
})
