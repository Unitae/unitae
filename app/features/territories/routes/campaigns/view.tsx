import { Pencil, Trash2 } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { previewCampaignLifecycle } from '~/features/territories/model/campaign-preview'
import { getCampaignStatus } from '~/features/territories/model/campaign-status'
import { getCampaign } from '~/features/territories/server/campaign.queries'
import { endCampaign } from '~/features/territories/server/campaign-lifecycle.workflow'
import { CampaignStatusBadge } from '~/features/territories/ui/CampaignStatusBadge'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.campaigns_meta_title() }]
}

const startLabels: Record<string, () => string> = {
  pause: m.campaigns_preview_start_pause,
  reassign: m.campaigns_preview_start_reassign,
  close: m.campaigns_preview_start_close,
  leave: m.campaigns_preview_start_leave,
}
const endLabels: Record<string, () => string> = {
  'close-campaign': m.campaigns_preview_end_close_campaign,
  'leave-campaign-open': m.campaigns_preview_end_leave_open,
  resume: m.campaigns_preview_end_resume,
  'keep-paused': m.campaigns_preview_end_keep,
  'close-regulars': m.campaigns_preview_end_close_regulars,
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.TerritoriesManager)

  const id = requireParamId(params.campaignId, '/territories/campaigns')

  return withScopeFromContext(context, async (db, congregationId) => {
    const campaign = await getCampaign(db, id, congregationId)
    if (campaign == null) throw redirect('/territories/campaigns')

    const scopeTerritories = await db.territory.findMany({
      where: { id: { in: campaign.scope.map(s => s.territoryId) }, congregationId },
      select: { id: true, number: true },
      orderBy: { number: 'asc' },
    })

    return { campaign, scopeTerritories }
  })
}

export default function CampaignView({ loaderData }: Route.ComponentProps) {
  const { campaign, scopeTerritories } = loaderData
  const status = getCampaignStatus({
    activatedAt: campaign.activatedAt ? new Date(campaign.activatedAt) : null,
    endedAt: campaign.endedAt ? new Date(campaign.endedAt) : null,
  })
  const preview = previewCampaignLifecycle(campaign)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={campaign.name}
        titleBadge={<CampaignStatusBadge status={status} />}
        subtitle={`${new Date(campaign.startDate).toLocaleDateString('fr-FR')} – ${new Date(
          campaign.endDate,
        ).toLocaleDateString('fr-FR')}`}
        breadcrumbs={[{ label: m.campaigns_title(), to: '/territories/campaigns' }, { label: campaign.name }]}
        backTo="/territories/campaigns"
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`/territories/campaigns/${campaign.id}/edit`}>
                <Pencil />
                {m.campaigns_edit_button()}
              </Link>
            </Button>
            {status === 'active' ? (
              <Form method="post">
                <input type="hidden" name="intent" value="end" />
                <Button type="submit" variant="destructive">
                  {m.campaigns_end_now_button()}
                </Button>
              </Form>
            ) : (
              <Button asChild variant="outline" className="text-destructive">
                <Link to={`/territories/campaigns/${campaign.id}/delete`}>
                  <Trash2 />
                  {m.campaigns_delete_title()}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {campaign.notes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{m.campaigns_view_notes_title()}</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{campaign.notes}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{m.campaigns_view_options_title()}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            <span className="text-muted-foreground">{m.campaigns_preview_start_prefix()}</span>{' '}
            {preview.start.map(key => startLabels[key]()).join(' ; ')}
          </p>
          <p>
            <span className="text-muted-foreground">{m.campaigns_preview_end_prefix()}</span>{' '}
            {preview.end.map(key => endLabels[key]()).join(' ; ')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.campaigns_view_scope_title()}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {scopeTerritories.length === 0 ? (
            <p className="text-muted-foreground">{m.campaigns_scope_all()}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {scopeTerritories.map(territory => (
                <span key={territory.id} className="rounded bg-muted px-2 py-0.5">
                  {territory.number}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.TerritoriesManager)

  const { id: actorId } = context.get(currentAccountContext)
  const id = requireParamId(params.campaignId, '/territories/campaigns')

  return withScopeFromContext(context, async (db, congregationId) => {
    const campaign = await getCampaign(db, id, congregationId)
    if (campaign == null) throw redirect('/territories/campaigns')

    // Manual « Terminer la campagne » — same idempotent transition the cron runs.
    await endCampaign(db, campaign, congregationId, actorId)

    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.campaigns_end_flash_success({ name: campaign.name }))
    return redirect(`/territories/campaigns/${campaign.id}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
