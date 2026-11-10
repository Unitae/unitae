import * as m from '~/i18n/paraglide/messages'
import { ConflictError, NotFoundError, ValidationError } from '~/shared/errors/app-error.server'

export interface GroupSaveRefusal {
  fieldErrors?: Record<string, string[]>
  formErrors?: string[]
}

/**
 * What the group form says when its save is refused, as Conform's reply options: a leader it no longer offers, on
 * the field at fault; a move the aggregate refuses (a group's leader taken out of the group they lead) or a group or
 * publisher gone meanwhile, above the form. Null for any other error, which the route lets through.
 */
export function groupSaveRefusal(error: unknown): GroupSaveRefusal | null {
  if (error instanceof ValidationError) return { fieldErrors: { [error.field]: [error.message] } }
  if (error instanceof ConflictError) return { formErrors: [error.message] }
  if (error instanceof NotFoundError) return { formErrors: [m.groups_members_error_not_found()] }
  return null
}
