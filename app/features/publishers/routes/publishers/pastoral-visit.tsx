import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { memberAggregate } from '~/features/publishers/index.server'
import {
  canRecordPastoralVisit,
  canViewPastoralVisit,
  type PastoralVisitAccessInput,
} from '~/features/publishers/model/pastoral-visit-access'
import { pastoralVisitSchema } from '~/features/publishers/schemas/pastoral-visit.schema'
import { getPastoralVisitForMember } from '~/features/publishers/server/pastoral-visit.queries'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import type { SanitizedAccount } from '~/shared/auth/sanitize-account.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { formatDateForInput } from '~/shared/utils/event-time'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/pastoral-visit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_visit_meta_title() }]
}

function accessInput(
  permissions: Set<Permission>,
  currentUser: SanitizedAccount,
  targetGroupId: number | null,
): PastoralVisitAccessInput {
  return {
    hasPublisherViewer: permissions.has(Permission.CanViewPublishers),
    hasPublisherManager: permissions.has(Permission.CanManagePublishers),
    myResponsibleGroupId: currentUser.member?.responsibleFor?.id ?? null,
    myDeputyGroupId: currentUser.member?.deputyFor?.id ?? null,
    targetGroupId,
  }
}

// Back to the publisher's record for those who may open it; a group's overseer, who may not, back
// to the group page he came from.
function backTo(permissions: Set<Permission>, member: { id: number; publisherGroupId: number | null }) {
  if (permissions.has(Permission.CanViewPublishers)) return `/publishers/${member.id}/view`
  return member.publisherGroupId != null ? `/groups/${member.publisherGroupId}/view` : '/'
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const publisherId = requireParamId(params.publisherId, '/publishers')
  const { timezone } = context.get(congregationContext)

  return withScopeFromContext(context, async (db, congregationId) => {
    const member = await getPastoralVisitForMember(db, publisherId, congregationId)
    if (member == null) throw redirect('/')

    const access = accessInput(permissions, currentUser, member.publisherGroupId)
    if (!canViewPastoralVisit(access)) throw redirect('/')

    return {
      name: formatPersonName(member),
      // A date-only value stored at UTC midnight: its calendar day, as the date input reads it.
      visitedOn: member.lastPastoralVisitAt?.toISOString().slice(0, 10) ?? null,
      today: formatDateForInput(new Date(), timezone),
      canRecord: canRecordPastoralVisit(access),
      backTo: backTo(permissions, member),
    }
  })
}

function formatVisitDate(visitedOn: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${visitedOn}T00:00:00Z`),
  )
}

export default function PastoralVisitPage({ loaderData, actionData }: Route.ComponentProps) {
  const { name, visitedOn, today, canRecord, backTo: back } = loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    defaultValue: { visitedOn: today },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: pastoralVisitSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.publishers_visit_title()}
        subtitle={m.publishers_visit_subtitle()}
        breadcrumbs={[{ label: name, to: back }, { label: m.publishers_visit_title() }]}
        backTo={back}
      />

      <Card>
        <CardHeader>
          <CardTitle>{name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm">
            {visitedOn
              ? m.publishers_visit_last({ date: formatVisitDate(visitedOn, getLocale()) })
              : m.publishers_visit_none()}
          </p>

          {canRecord && (
            <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4">
              <div className="flex max-w-xs flex-col gap-2">
                <Label htmlFor={fields.visitedOn.id}>{m.publishers_visit_date_label()}</Label>
                <Input {...getInputProps(fields.visitedOn, { type: 'date' })} max={today} />
                {fields.visitedOn.errors && <p className="text-destructive text-sm">{fields.visitedOn.errors}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="intent" value="save">
                  {m.publishers_visit_save()}
                </SubmitButton>
                {visitedOn && (
                  <Button type="submit" name="intent" value="clear" variant="outline" formNoValidate>
                    {m.publishers_visit_clear()}
                  </Button>
                )}
              </div>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const publisherId = requireParamId(params.publisherId, '/publishers')
  const { timezone } = context.get(congregationContext)

  const submission = parseWithZod(await request.formData(), { schema: pastoralVisitSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const member = await getPastoralVisitForMember(db, publisherId, congregationId)
    if (member == null) throw redirect('/')

    const access = accessInput(permissions, currentUser, member.publisherGroupId)
    if (!canRecordPastoralVisit(access)) throw redirect('/')

    const { value } = submission
    // A visit is recorded once it happened: not later than today on the congregation's calendar.
    if (value.intent === 'save' && value.visitedOn > formatDateForInput(new Date(), timezone)) {
      return data(submission.reply({ fieldErrors: { visitedOn: [m.publishers_visit_error_future()] } }), {
        status: 400,
      })
    }

    const visitedOn = value.intent === 'save' ? new Date(`${value.visitedOn}T00:00:00Z`) : null
    await memberAggregate.setLastPastoralVisit(db, member.id, congregationId, visitedOn, currentUser.id)

    const session = await getSession(request.headers.get('Cookie'))
    const name = formatPersonName(member)
    session.flash('success', visitedOn ? m.publishers_visit_saved({ name }) : m.publishers_visit_cleared({ name }))
    return redirect(backTo(permissions, member), { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
