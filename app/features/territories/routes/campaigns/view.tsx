import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Form, Link, redirect, useNavigate } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { previewCampaignLifecycle } from '~/features/territories/model/campaign-preview'
import { getCampaignStatus } from '~/features/territories/model/campaign-status'
import { getCampaign, listCampaignAttributions } from '~/features/territories/server/campaign.queries'
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
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'
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
  requirePermission(permissions, Permission.CanManageTerritoryCampaigns)

  const id = requireParamId(params.campaignId, '/territories/attributions/campaigns')

  return withScopeFromContext(context, async (db, congregationId) => {
    const campaign = await getCampaign(db, id, congregationId)
    if (campaign == null) throw redirect('/territories/attributions/campaigns')

    const scopeTerritories = await db.territory.findMany({
      where: { id: { in: campaign.scope.map(s => s.territoryId) }, congregationId },
      select: { id: true, number: true },
      orderBy: { number: 'asc' },
    })

    const attributions = await listCampaignAttributions(db, campaign.id, congregationId)

    // Coverage: distinct in-scope territories the campaign has touched, over
    // the scope size (empty scope = every territory of the congregation).
    const scopeIds = new Set(campaign.scope.map(scopeRow => scopeRow.territoryId))
    const scopeSize = scopeIds.size > 0 ? scopeIds.size : await db.territory.count({ where: { congregationId } })
    const workedTerritoryIds = new Set(
      attributions.map(a => a.territory.id).filter(id => scopeIds.size === 0 || scopeIds.has(id)),
    )
    const coveragePercent = scopeSize === 0 ? 0 : Math.round((workedTerritoryIds.size / scopeSize) * 100)

    return { campaign, scopeTerritories, attributions, coveragePercent }
  })
}

export default function CampaignView({ loaderData }: Route.ComponentProps) {
  const { campaign, scopeTerritories, attributions, coveragePercent } = loaderData
  const navigate = useNavigate()
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
        breadcrumbs={[
          { label: m.sidebar_attributions(), to: '/territories/attributions' },
          { label: m.campaigns_title(), to: '/territories/attributions/campaigns' },
          { label: campaign.name },
        ]}
        backTo="/territories/attributions/campaigns"
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`/territories/attributions/campaigns/${campaign.id}/edit`}>
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
                <Link to={`/territories/attributions/campaigns/${campaign.id}/delete`}>
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
          <CardTitle>{m.campaigns_view_attributions_title({ percent: coveragePercent })}</CardTitle>
          {status === 'active' && (
            <CardAction>
              <Button asChild size="sm" variant="outline">
                <Link to="/territories/attributions/new/available-territories">
                  <Plus />
                  {m.attributions_assign_button()}
                </Link>
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {attributions.length === 0 ? (
            <p className="text-muted-foreground text-sm">{m.campaigns_view_attributions_empty()}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.attributions_table_number()}</TableHead>
                  <TableHead>{m.attributions_table_publisher()}</TableHead>
                  <TableHead className="max-sm:hidden">{m.attributions_table_checkout_date()}</TableHead>
                  <TableHead>{m.campaigns_view_attributions_return()}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {attributions.map(attribution => (
                  <TableRow
                    key={attribution.id}
                    className="cursor-pointer hover:bg-accent/30"
                    onClick={event => {
                      if (event.defaultPrevented) return
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                      if ((event.target as HTMLElement).closest('a, button, [role="button"]')) return
                      navigate(`/territories/attributions/${attribution.id}/edit`)
                    }}
                  >
                    <TableCell>
                      <Link
                        to={`/territories/territory/${attribution.territory.id}/view`}
                        className="hover:text-primary"
                      >
                        {attribution.territory.number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {attribution.publisher.firstname} {attribution.publisher.lastname?.toLocaleUpperCase()}
                    </TableCell>
                    <TableCell className="max-sm:hidden">
                      {new Date(attribution.startDate).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>
                      {attribution.endDate != null ? (
                        new Date(attribution.endDate).toLocaleDateString('fr-FR')
                      ) : (
                        <Badge variant="warning">{m.campaigns_view_attributions_open()}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`/territories/attributions/${attribution.id}/edit`} title={m.campaigns_edit_button()}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
  requirePermission(permissions, Permission.CanManageTerritoryCampaigns)

  const { id: actorId } = context.get(currentAccountContext)
  const id = requireParamId(params.campaignId, '/territories/attributions/campaigns')

  return withScopeFromContext(context, async (db, congregationId) => {
    const campaign = await getCampaign(db, id, congregationId)
    if (campaign == null) throw redirect('/territories/attributions/campaigns')

    // Manual « Terminer la campagne » — same idempotent transition the cron runs.
    await endCampaign(db, campaign, congregationId, actorId)

    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.campaigns_end_flash_success({ name: campaign.name }))
    return redirect(`/territories/attributions/campaigns/${campaign.id}`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
