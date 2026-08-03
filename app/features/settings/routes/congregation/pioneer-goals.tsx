import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { isEditableServiceYear, toServiceYear } from '~/features/publishers'
import { listPioneerGoalsForYear, setPioneerGoal } from '~/features/publishers/index.server'
import { pioneerGoalsSchema } from '~/features/settings/schemas/pioneer-goals.schema'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { zonedNow } from '~/shared/utils/zoned-now'

import type { Route } from './+types/pioneer-goals'

export const meta: Route.MetaFunction = () => [{ title: m.settings_pioneer_goals_meta_title() }]

// Field-name ↔ PublisherType mapping for the four goal inputs.
const FIELD_TYPES = [
  { field: 'permanent', type: PublisherType.PionnierPermanant, label: () => m.pioneers_type_permanent() },
  { field: 'auxiliary', type: PublisherType.PionnierAuxiliaires, label: () => m.pioneers_type_auxiliary() },
  { field: 'special', type: PublisherType.PionnierSpecial, label: () => m.pioneers_type_special() },
  { field: 'missionary', type: PublisherType.Missionnaire, label: () => m.pioneers_type_missionary() },
] as const

function resolveServiceYear(request: Request, currentYear: number): number {
  const requested = Number(new URL(request.url).searchParams.get('sy'))
  // Editing is limited to the current and next service year; anything else → current.
  return isEditableServiceYear(requested, currentYear) ? requested : currentYear
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Permission.PioneerGoalManager)) throw redirect('/settings')

  const now = zonedNow(context.get(congregationContext).timezone)
  const currentYear = toServiceYear(now.getMonth(), now.getFullYear())
  const serviceYear = resolveServiceYear(request, currentYear)

  return withScopeFromContext(context, async db => {
    const goals = await listPioneerGoalsForYear(db, serviceYear)
    return { serviceYear, currentYear, goals }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const { id: actorId } = context.get(currentAccountContext)
  if (!permissions.has(Permission.PioneerGoalManager)) throw redirect('/settings')

  const now = zonedNow(context.get(congregationContext).timezone)
  const currentYear = toServiceYear(now.getMonth(), now.getFullYear())

  const submission = parseWithZod(await request.formData(), { schema: pioneerGoalsSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

  const { serviceYear } = submission.value
  if (!isEditableServiceYear(serviceYear, currentYear)) {
    return data(submission.reply({ formErrors: [m.settings_pioneer_goals_past_year_error()] }), { status: 400 })
  }

  const session = await getSession(request.headers.get('Cookie'))
  await withScopeFromContext(context, async (db, congregationId) => {
    for (const { field, type } of FIELD_TYPES) {
      await setPioneerGoal(db, { serviceYear, type, monthlyHours: submission.value[field], congregationId, actorId })
    }
  })

  session.flash('success', m.settings_pioneer_goals_saved_success())
  return redirect(`/settings/congregation/pioneer-goals?sy=${serviceYear}`, {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}

export default function PioneerGoalsPage({ loaderData, actionData }: Route.ComponentProps) {
  const { serviceYear, currentYear, goals } = loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate: ({ formData }) => parseWithZod(formData, { schema: pioneerGoalsSchema }),
  })

  const goalOf = (type: PublisherType) => goals.find(g => g.type === type)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={m.settings_pioneer_goals_title()}
        subtitle={m.settings_pioneer_goals_subtitle()}
        backTo="/settings/congregation"
        breadcrumbs={[
          { label: m.sidebar_settings(), to: '/settings' },
          { label: m.sidebar_settings_assembly(), to: '/settings/congregation' },
          { label: m.settings_pioneer_goals_title() },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        <Button asChild variant={serviceYear === currentYear ? 'default' : 'outline'} size="sm">
          <Link to={`?sy=${currentYear}`}>
            {m.pioneers_service_year({ start: String(currentYear), end: String(currentYear + 1) })}
          </Link>
        </Button>
        <Button asChild variant={serviceYear === currentYear + 1 ? 'default' : 'outline'} size="sm">
          <Link to={`?sy=${currentYear + 1}`}>
            {m.pioneers_service_year({ start: String(currentYear + 1), end: String(currentYear + 2) })}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-5">
            <input type="hidden" name="serviceYear" value={serviceYear} />
            {FIELD_TYPES.map(({ field, type, label }) => {
              const goal = goalOf(type)
              return (
                <div key={field} className="flex flex-col gap-1.5">
                  <Label htmlFor={fields[field].id}>{label()}</Label>
                  <Input
                    {...getInputProps(fields[field], { type: 'number' })}
                    key={fields[field].id}
                    defaultValue={goal?.effectiveRate}
                    min={0}
                    className="max-w-[8rem]"
                  />
                  <span className="text-muted-foreground text-xs">
                    {m.settings_pioneer_goals_default_hint({ rate: String(goal?.defaultRate ?? 0) })}
                    {goal?.override != null && ` · ${m.settings_pioneer_goals_customised()}`}
                  </span>
                  {fields[field].errors && <p className="text-destructive text-sm">{fields[field].errors}</p>}
                </div>
              )
            })}
            {form.errors && <p className="text-destructive text-sm">{form.errors}</p>}
            <SubmitButton>{m.common_save()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
