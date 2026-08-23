import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import {
  CampaignRegularEndAction,
  CampaignRegularStartAction,
} from '~/features/territories/model/campaign-lifecycle.type'
import { campaignSchema } from '~/features/territories/schemas/campaign.schema'
import { createCampaign } from '~/features/territories/server/campaign.aggregate'
import { CampaignForm } from '~/features/territories/ui/CampaignForm'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { Card, CardContent } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.campaigns_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.TerritoriesManager)

  return withScopeFromContext(context, async (db, congregationId) => {
    const territories = await db.territory.findMany({
      where: { congregationId },
      select: { id: true, number: true, type: true },
      orderBy: { number: 'asc' },
    })
    return { territories }
  })
}

export default function NewCampaignPage({ loaderData, actionData }: Route.ComponentProps) {
  const { territories } = loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: campaignSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.campaigns_new_title()}
        breadcrumbs={[{ label: m.campaigns_title(), to: '/territories/campaigns' }, { label: m.campaigns_new_title() }]}
        backTo="/territories/campaigns"
      />
      <Card>
        <CardContent className="pt-6">
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4">
            <CampaignForm
              defaults={{
                name: '',
                notes: '',
                startDate: '',
                endDate: '',
                durationDays: null,
                startRegularAction: CampaignRegularStartAction.Pause,
                startAutoReassign: false,
                endCloseCampaign: true,
                endRegularAction: CampaignRegularEndAction.Resume,
                scopeTerritoryIds: [],
              }}
              territories={territories}
              errors={{
                name: fields.name.errors,
                'end-date': fields['end-date'].errors,
                'start-auto-reassign': fields['start-auto-reassign'].errors,
              }}
            />
            {form.errors && <p className="text-destructive text-sm">{form.errors}</p>}
            <FormActions>
              <SubmitButton>{m.campaigns_form_submit()}</SubmitButton>
            </FormActions>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.TerritoriesManager)

  const { id: actorId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async (db, congregationId) => {
    const submission = parseWithZod(await request.formData(), { schema: campaignSchema })
    if (submission.status !== 'success') {
      return data(submission.reply(), { status: 400 })
    }
    const input = submission.value

    try {
      const campaign = await createCampaign(db, {
        name: input.name,
        notes: input.notes,
        startDate: input['start-date'],
        endDate: input['end-date'],
        durationDays: input['duration-days'] ?? null,
        startRegularAction: input['start-regular-action'],
        startAutoReassign: input['start-auto-reassign'],
        endCloseCampaign: input['end-close-campaign'],
        endRegularAction: input['end-regular-action'],
        scopeTerritoryIds: input.scope,
        congregationId,
        actorId,
      })

      const session = await getSession(request.headers.get('Cookie'))
      session.flash('success', m.campaigns_create_flash_success({ name: campaign.name }))
      return redirect(`/territories/campaigns/${campaign.id}`, {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    } catch (err) {
      if (err instanceof ConflictError && err.message === 'campaign_overlap') {
        return data(submission.reply({ formErrors: [m.campaigns_overlap_error()] }), { status: 409 })
      }
      throw err
    }
  })
}
