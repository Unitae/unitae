import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { type ProgrammeCreationInput, programmeCreationSchema } from '~/features/events/schemas/program-new.schema'
import { createFreeformEvent } from '~/features/events/server/event-parts.server'
import { canManageAnyProgram, getResponsibleTemplateIds } from '~/features/events/server/events-auth.server'
import { getProgrammeCreationData } from '~/features/events/server/programme-creation.queries'
import {
  type CreationContext,
  createProgrammeOnDay,
  createProgrammeSeries,
  ProgrammeExistsError,
} from '~/features/events/server/programme-creation.server'
import { ProgrammeCreationForm } from '~/features/events/ui/creation/ProgrammeCreationForm'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { PageHeader } from '~/shared/ui/PageHeader'
import { dayOf, isCalendarDay, mondayOf } from '~/shared/utils/calendar-day'
import { combineLocalDateTime } from '~/shared/utils/event-time'
import type { Route } from './+types/new'

type Session = Awaited<ReturnType<typeof getSession>>

export const meta: Route.MetaFunction = () => [{ title: m.programs_new_meta_title() }]

/**
 * Who creates what: a programme manager any template, and « Autre évènement »; someone responsible for a few
 * programmes, those templates only. Nobody else reaches the page.
 */
export function loader({ context, request }: Route.LoaderArgs) {
  const canManage = context.get(permissionsContext).has(Permission.CanManagePrograms)
  const { id: accountId } = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const today = dayOf(new Date(), timezone)
  const week = new URL(request.url).searchParams.get('week')

  return withScopeFromContext(context, async (db, congregationId) => {
    const templateIds = canManage ? null : await getResponsibleTemplateIds(db, accountId, congregationId)
    if (templateIds?.length === 0) throw redirect('/programs')
    const { templates, existing } = await getProgrammeCreationData(db, { congregationId, timezone, today, templateIds })
    return { templates, existing, today, canManage, week: isCalendarDay(week) ? mondayOf(week) : null }
  })
}

export default function NewProgrammesPage({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader
        title={m.programs_new_page_title()}
        breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: m.programs_new_page_title() }]}
      />
      <ProgrammeCreationForm {...loaderData} result={actionData} />
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const can = (permission: Permission) => permissions.has(permission)
  const { id: actorId } = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const submission = parseWithZod(await request.formData(), {
    schema: programmeCreationSchema(dayOf(new Date(), timezone)),
  })
  if (submission.status !== 'success') return data({ result: submission.reply() }, { status: 400 })
  const input = submission.value
  const session = await getSession(request.headers.get('Cookie'))

  // Refusals are caught outside the transaction, which must not commit on them.
  try {
    const next = await withScopeFromContext(context, async (db, congregationId) => {
      if (!(await canManageAnyProgram(db, can, actorId, congregationId))) throw redirect('/programs')
      const allowed = can(Permission.CanManagePrograms)
        ? null
        : await getResponsibleTemplateIds(db, actorId, congregationId)
      if (!mayCreate(input, allowed)) throw redirect('/programs')
      return create(db, input, { congregationId, timezone, actorId }, session)
    })
    return redirect(next, { headers: { 'Set-Cookie': await commitSession(session) } })
  } catch (error) {
    if (error instanceof ProgrammeExistsError) {
      const result = submission.reply({ fieldErrors: { day: [m.programs_new_error_exists()] } })
      return data({ result, existingId: error.eventId }, { status: 409 })
    }
    if (error instanceof NotFoundError) {
      return data({ result: submission.reply({ formErrors: [m.programs_new_error_unavailable()] }) }, { status: 400 })
    }
    throw error
  }
}

/** `allowed`: the templates someone responsible for a few may use; null for a programme manager. */
function mayCreate(input: ProgrammeCreationInput, allowed: number[] | null): boolean {
  if (allowed == null) return true
  if (input.mode === 'freeform') return false
  if (input.mode === 'series') return input.templateIds.every(id => allowed.includes(id))
  return allowed.includes(input.templateId)
}

/** Creates what the form asks for, and answers where to go next: the list on those weeks, or the new programme. */
async function create(
  db: TransactionClient,
  input: ProgrammeCreationInput,
  ctx: CreationContext,
  session: Session,
): Promise<string> {
  if (input.mode === 'series') {
    const { created } = await createProgrammeSeries(db, input, ctx)
    const count = created.length
    session.flash('success', count === 0 ? m.programs_new_flash_none() : m.programs_new_flash({ count: count }))
    const period = new URLSearchParams({ from: input.from, to: input.to })
    if (count > 0) period.set('view', 'drafts')
    return `/programs?${period.toString()}`
  }

  const id =
    input.mode === 'single'
      ? (await createProgrammeOnDay(db, { templateId: input.templateId, day: input.day }, ctx)).id
      : (
          await createFreeformEvent(db, {
            name: input.name,
            startDate: combineLocalDateTime(input.day, input.startTime, ctx.timezone),
            endDate: combineLocalDateTime(input.day, input.endTime, ctx.timezone),
            createdById: ctx.actorId,
            congregationId: ctx.congregationId,
          })
        ).id
  session.flash('success', m.programs_new_flash_single())
  return `/programs/events/${id}/edit`
}
