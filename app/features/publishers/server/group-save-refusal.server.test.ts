import { describe, expect, it, vi } from 'vitest'

vi.mock('~/i18n/paraglide/messages', () => ({
  groups_members_error_not_found: () => 'publisher gone',
}))

const { groupSaveRefusal } = await import('./group-save-refusal.server')
const { ConflictError, NotFoundError, ValidationError } = await import('~/shared/errors/app-error.server')

describe('groupSaveRefusal', () => {
  // A leader the form no longer offers (a stale page): said under the field at fault.
  it('puts a refused leader on the field at fault', () => {
    expect(groupSaveRefusal(new ValidationError('deputy', 'already assists Sud'))).toEqual({
      fieldErrors: { deputy: ['already assists Sud'] },
    })
  })

  // A group's leader moved out of the group they lead, from the members: the whole form hears it.
  it('says a refused move above the form, in its own words', () => {
    expect(groupSaveRefusal(new ConflictError('Paul BERNARD dirige le groupe Sud.'))).toEqual({
      formErrors: ['Paul BERNARD dirige le groupe Sud.'],
    })
  })

  it('says a group or publisher gone meanwhile above the form', () => {
    expect(groupSaveRefusal(new NotFoundError('PublisherGroup', 4))).toEqual({ formErrors: ['publisher gone'] })
  })

  it('leaves any other error to the error boundary', () => {
    expect(groupSaveRefusal(new Error('database down'))).toBeNull()
  })
})
