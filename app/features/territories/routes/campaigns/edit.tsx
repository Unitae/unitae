import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { runCampaignLifecycleSweep } from '~/features/territories/jobs/handle-campaign-lifecycle-work.server'
import { campaignSchema } from '~/features/territories/schemas/campaign.schema'
import { updateCampaign } from '~/features/territories/server/campaign.aggregate'
import { getCampaign } from '~/features/territories/server/campaign.queries'
import { applyScopeChange } from '~/features/territories/server/campaign-lifecycle.workflow'
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
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.campaigns_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.TerritoriesManager)

  const id = requireParamId(params.campaignId, '/territories/attributions/campaigns')

  return withScopeFromContext(context, async (db, congregationId) => {
    const campaign = await getCampaign(db, id, congregationId)
    if (campaign == null) throw redirect('/territories/attributions/campaigns')

    const territories = await db.territory.findMany({
      where: { congregationId },
      select: { id: true, number: true, type: true },
      orderBy: { number: 'asc' },
    })
    return { campaign, territories }
  })
}

export default function EditCampaignPage({ loaderData, actionData }: Route.ComponentProps) {
  const { campaign, territories } = loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: campaignSchema })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.campaigns_edit_title()}
        subtitle={campaign.name}
        breadcrumbs={[
          { label: m.sidebar_attributions(), to: '/territories/attributions' },
          { label: m.campaigns_title(), to: '/territories/attributions/campaigns' },
          { label: campaign.name, to: `/territories/attributions/campaigns/${campaign.id}` },
          { label: m.campaigns_edit_title() },
        ]}
        backTo={`/territories/attributions/campaigns/${campaign.id}`}
      />
      <Card>
        <CardContent className="pt-6">
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4">
            <CampaignForm
              defaults={{
                name: campaign.name,
                notes: campaign.notes,
                startDate: new Date(campaign.startDate).toLocaleDateString('en-CA'),
                endDate: new Date(campaign.endDate).toLocaleDateString('en-CA'),
                restPeriodDays: campaign.restPeriodDays,
                startRegularAction: campaign.startRegularAction,
                startAutoReassign: campaign.startAutoReassign,
                endCloseCampaign: campaign.endCloseCampaign,
                endRegularAction: campaign.endRegularAction,
                scopeTerritoryIds: campaign.scope.map(s => s.territoryId),
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

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.TerritoriesManager)

  const { id: actorId } = context.get(currentAccountContext)
  const id = requireParamId(params.campaignId, '/territories/attributions/campaigns')

  return withScopeFromContext(context, async (db, congregationId) => {
    const submission = parseWithZod(await request.formData(), { schema: campaignSchema })
    if (submission.status !== 'success') {
      return data(submission.reply(), { status: 400 })
    }
    const input = submission.value

    const campaign = await getCampaign(db, id, congregationId)
    if (campaign == null) throw redirect('/territories/attributions/campaigns')

    try {
      await updateCampaign(db, id, congregationId, actorId, {
        name: input.name,
        notes: input.notes,
        startDate: input['start-date'],
        endDate: input['end-date'],
        restPeriodDays: input['rest-period-days'] ?? null,
        startRegularAction: input['start-regular-action'],
        startAutoReassign: input['start-auto-reassign'],
        endCloseCampaign: input['end-close-campaign'],
        endRegularAction: input['end-regular-action'],
        congregationId,
        actorId,
      })

      // Scope goes through the workflow so an active campaign's transitions
      // run for added/removed territories (recomputed server-side — no TOCTOU).
      const scopeResult = await applyScopeChange(db, campaign, input.scope, congregationId, actorId)

      // Date edits can make the campaign due to start (or end) right now —
      // apply the idempotent lifecycle pass instead of waiting for the cron.
      await runCampaignLifecycleSweep(db, congregationId, new Date())

      const session = await getSession(request.headers.get('Cookie'))
      session.flash('success', m.campaigns_update_flash_success({ name: input.name }))
      if (scopeResult.added > 0 || scopeResult.removed > 0) {
        session.flash(
          'success',
          m.campaigns_scope_change_flash({ added: String(scopeResult.added), removed: String(scopeResult.removed) }),
        )
      }
      return redirect(`/territories/attributions/campaigns/${id}`, {
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
