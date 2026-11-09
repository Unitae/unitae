import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { enrolmentTypeOf } from '~/features/publishers/model/pioneer-enrolment-form'
import {
  type EnrolmentActionInput,
  enrolmentActionSchema,
} from '~/features/publishers/schemas/pioneer-enrolment.schema'
import { PIONEER_ENROLMENT_CONFLICT } from '~/features/publishers/server/pioneer-enrolment.aggregate'
import { getEnrolmentsForMember } from '~/features/publishers/server/pioneer-enrolment.queries'
import {
  endPioneerEnrolment,
  enrolPioneer,
  removePioneerEnrolment,
  updatePioneerEnrolment,
} from '~/features/publishers/server/pioneer-enrolment.workflow'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { AppError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/enrolments'

// The pioneer-enrolment dialogs of the publisher record post here: enrol, correct a stint, stop the ongoing one, or
// remove one recorded in error. The dialogs show only to publisher managers, so anyone else is turned away outright;
// a refused or invalid change answers with the form's errors, never a redirect, so the dialog stays open on them.

interface Actor {
  memberId: number
  congregationId: number
  actorId: number
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManagePublishers)
  const { congregationId, id: actorId } = context.get(currentAccountContext)
  const memberId = requireParamId(params.publisherId, '/publishers')

  const submission = parseWithZod(await request.formData(), { schema: enrolmentActionSchema })
  if (submission.status !== 'success') {
    // The schema speaks to developers; the dialog shows the rule in the reader's words.
    const endFirst = submission.error?.endMonth != null
    const message = endFirst ? m.publishers_enrolment_error_end_before_start() : m.publishers_enrolment_error()
    return data(submission.reply({ formErrors: [message] }), { status: 400 })
  }
  const input = submission.value

  return withScopeFromContext(context, async db => {
    const refuse = (message: string, status: number) => data(submission.reply({ formErrors: [message] }), { status })

    // A stint is changed through its publisher's record only: an id from elsewhere is not found here.
    if (input.intent !== 'create') {
      const stints = await getEnrolmentsForMember(db, memberId, congregationId)
      if (!stints.some(stint => stint.id === input.enrolmentId)) return refuse(m.publishers_enrolment_error(), 404)
    }

    try {
      await runIntent(db, input, { memberId, congregationId, actorId })
    } catch (error) {
      if (!(error instanceof AppError)) throw error
      return refuse(conflictMessage(error), 409)
    }

    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', successMessage(input.intent))
    return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}

function runIntent(db: TransactionClient, input: EnrolmentActionInput, { memberId, congregationId, actorId }: Actor) {
  switch (input.intent) {
    case 'create': {
      // A one-month auxiliary ends the month it starts; every other service runs until it is stopped.
      const single = input.mode === 'monthly-aux'
      return enrolPioneer(db, memberId, congregationId, actorId, {
        type: enrolmentTypeOf(input.mode),
        startMonth: input.startMonth,
        startYear: input.startYear,
        ...(single ? { endMonth: input.startMonth, endYear: input.startYear, monthlyGoal: input.monthlyGoal } : {}),
      })
    }
    case 'correct': {
      const single = input.mode === 'monthly-aux'
      const end = single
        ? { endMonth: input.startMonth, endYear: input.startYear }
        : { endMonth: input.endMonth, endYear: input.endYear }
      return updatePioneerEnrolment(db, input.enrolmentId, congregationId, actorId, {
        type: enrolmentTypeOf(input.mode),
        startMonth: input.startMonth,
        startYear: input.startYear,
        ...end,
        // An emptied goal drops the stint back to the congregation's rate for its service.
        monthlyGoal: input.monthlyGoal ?? null,
      })
    }
    case 'stop':
      return endPioneerEnrolment(db, input.enrolmentId, congregationId, actorId, {
        endMonth: input.endMonth,
        endYear: input.endYear,
      })
    case 'remove':
      return removePioneerEnrolment(db, input.enrolmentId, congregationId, actorId)
  }
}

function successMessage(intent: EnrolmentActionInput['intent']) {
  switch (intent) {
    case 'create':
      return m.publishers_enrolment_enrolled_success()
    case 'correct':
      return m.publishers_enrolment_corrected_success()
    case 'stop':
      return m.publishers_enrolment_ended_success()
    case 'remove':
      return m.publishers_enrolment_removed_success()
  }
}

/** The rule a refused change broke, in words a manager can act on. */
function conflictMessage(error: AppError) {
  if (error.message === PIONEER_ENROLMENT_CONFLICT.overlap) return m.publishers_enrolment_error_overlap()
  if (error.message === PIONEER_ENROLMENT_CONFLICT.endBeforeStart)
    return m.publishers_enrolment_error_end_before_start()
  return m.publishers_enrolment_error()
}
