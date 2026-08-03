import { parseWithZod } from '@conform-to/zod'
import { type RouterContext, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import {
  closeAppointmentSchema,
  monthlyAuxiliaryEnrolmentSchema,
  removeEnrolmentSchema,
  standingAppointmentSchema,
} from '~/features/publishers/schemas/pioneer-enrolment.schema'
import { PIONEER_ENROLMENT_CONFLICT } from '~/features/publishers/server/pioneer-enrolment.aggregate'
import {
  endPioneerEnrolment,
  enrolPioneer,
  removePioneerEnrolment,
} from '~/features/publishers/server/pioneer-enrolment.workflow'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AppError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { PublisherType } from '~/shared/types/publisher-type'
import { requireParamId } from '~/shared/utils/params.server'

interface RouteContext {
  get<T>(context: RouterContext<T>): T
}

export const PIONEER_ENROLMENT_INTENTS = ['enrol-standing', 'close-standing', 'enrol-monthly', 'remove-enrolment']

// Handles the three pioneer-enrolment intents posted from the publisher edit page. Each parses its
// own schema and delegates to the enrolment workflow (which keeps Member.type in sync); a business
// rule violation (e.g. an overlapping stint) surfaces as an error flash rather than a 500.
export async function handlePioneerEnrolmentIntent(
  request: Request,
  params: { publisherId?: string },
  context: RouteContext,
  formData: FormData,
): Promise<Response> {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.PublisherManager)) {
    throw redirect('/')
  }

  const memberId = requireParamId(params.publisherId, '/publishers')
  const { congregationId, id: actorId } = currentUser
  const session = await getSession(request.headers.get('Cookie'))

  try {
    await runIntent(context, formData, memberId, congregationId, actorId)
    const intent = formData.get('intent')
    session.flash(
      'success',
      intent === 'close-standing'
        ? m.publishers_enrolment_ended_success()
        : intent === 'remove-enrolment'
          ? m.publishers_enrolment_removed_success()
          : m.publishers_enrolment_enrolled_success(),
    )
  } catch (error) {
    // Validation failures and business-rule violations (AppError, e.g. overlap) become a flash;
    // anything unexpected propagates. Known business rules get a specific, actionable message.
    if (!(error instanceof AppError) && !(error instanceof EnrolmentValidationError)) throw error
    session.flash('error', enrolmentErrorMessage(error))
  }

  // Back to the edit page (there is no bare /publishers/:id route) so the manager sees the updated
  // appointment / close form.
  return redirect(`/publishers/${memberId}/edit`, { headers: { 'Set-Cookie': await commitSession(session) } })
}

class EnrolmentValidationError extends Error {}

// Map a caught enrolment error to the message the manager sees. The aggregate's ConflictError
// carries a rule code as its message; translate the ones a manager can act on, and fall back to the
// generic message for validation failures and anything unrecognised.
function enrolmentErrorMessage(error: AppError | EnrolmentValidationError): string {
  if (error instanceof AppError) {
    if (error.message === PIONEER_ENROLMENT_CONFLICT.overlap) return m.publishers_enrolment_error_overlap()
    if (error.message === PIONEER_ENROLMENT_CONFLICT.endBeforeStart)
      return m.publishers_enrolment_error_end_before_start()
  }
  return m.publishers_enrolment_error()
}

function runIntent(
  context: RouteContext,
  formData: FormData,
  memberId: number,
  congregationId: number,
  actorId: number,
): Promise<unknown> {
  const intent = formData.get('intent')

  if (intent === 'enrol-standing') {
    const submission = parseWithZod(formData, { schema: standingAppointmentSchema })
    if (submission.status !== 'success') throw new EnrolmentValidationError()
    const { type, startMonth, startYear } = submission.value
    return withScopeFromContext(context, db =>
      enrolPioneer(db, memberId, congregationId, actorId, { type, startMonth, startYear }),
    )
  }

  if (intent === 'enrol-monthly') {
    const submission = parseWithZod(formData, { schema: monthlyAuxiliaryEnrolmentSchema })
    if (submission.status !== 'success') throw new EnrolmentValidationError()
    const { month, year, monthlyGoal } = submission.value
    return withScopeFromContext(context, db =>
      enrolPioneer(db, memberId, congregationId, actorId, {
        type: PublisherType.PionnierAuxiliaires,
        startMonth: month,
        startYear: year,
        endMonth: month,
        endYear: year,
        monthlyGoal,
      }),
    )
  }

  if (intent === 'remove-enrolment') {
    const submission = parseWithZod(formData, { schema: removeEnrolmentSchema })
    if (submission.status !== 'success') throw new EnrolmentValidationError()
    return withScopeFromContext(context, db =>
      removePioneerEnrolment(db, submission.value.enrolmentId, congregationId, actorId),
    )
  }

  const submission = parseWithZod(formData, { schema: closeAppointmentSchema })
  if (submission.status !== 'success') throw new EnrolmentValidationError()
  const { enrolmentId, endMonth, endYear } = submission.value
  return withScopeFromContext(context, db =>
    endPioneerEnrolment(db, enrolmentId, congregationId, actorId, { endMonth, endYear }),
  )
}
