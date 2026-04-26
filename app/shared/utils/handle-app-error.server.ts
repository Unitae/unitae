import { redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import * as m from '~/paraglide/messages'
import {
  AppError,
  ConflictError,
  ForbiddenError,
  LimitReachedError,
  NotFoundError,
  ValidationError,
} from '~/shared/errors/app-error.server'

type FlashSession = { flash(name: 'error' | 'success', message: string): void }

function appErrorToFlashMessage(error: AppError): string {
  if (error instanceof LimitReachedError) return m.error_limit_reached()
  if (error instanceof NotFoundError) return m.error_not_found()
  if (error instanceof ForbiddenError) return m.error_forbidden()
  if (error instanceof ConflictError) return m.error_conflict()
  if (error instanceof ValidationError) return m.error_validation({ field: error.field })
  return m.common_generic_error()
}

export async function handleAppError(error: unknown, session: FlashSession, redirectTo: string): Promise<never> {
  if (!(error instanceof AppError)) throw error

  session.flash('error', appErrorToFlashMessage(error))
  throw redirect(redirectTo, {
    headers: { 'Set-Cookie': await commitSession(session as Parameters<typeof commitSession>[0]) },
  })
}
