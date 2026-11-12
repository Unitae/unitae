import { MetricStrip, Panel, ProgressBar, StatTile } from '@unitae/ui'
import { CalendarRange } from 'lucide-react'
import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { campaignLength, formatCampaignDay, formatCampaignRange } from '~/features/territories/model/campaign-days'
import { previewCampaignLifecycle } from '~/features/territories/model/campaign-preview'
import { campaignStepStates, scopeTiles } from '~/features/territories/model/campaign-progress'
import { getCampaignStatus } from '~/features/territories/model/campaign-status'
import { RESTING_PERIOD_DAYS } from '~/features/territories/model/resting-periods'
import { getCampaign } from '~/features/territories/server/campaign.queries'
import { endCampaign } from '~/features/territories/server/campaign-lifecycle.workflow'
import { countCampaignReferences, getCampaignProgress } from '~/features/territories/server/campaign-progress.queries'
import { CampaignActions } from '~/features/territories/ui/CampaignActions'
import { CampaignAttributionTable } from '~/features/territories/ui/CampaignAttributionTable'
import { CampaignScopeTiles } from '~/features/territories/ui/CampaignScopeTiles'
import { CampaignStateTag } from '~/features/territories/ui/CampaignStateTag'
import { CampaignTimeline } from '~/features/territories/ui/CampaignTimeline'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { PageHeader } from '~/shared/ui/PageHeader'
import { daysBetween } from '~/shared/utils/calendar-day'
import { formatLocalDate } from '~/shared/utils/date.server'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/view'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.campaigns_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritoryCampaigns)

  const id = requireParamId(params.campaignId, '/territories/attributions/campaigns')

  return withScopeFromContext(context, async (db, congregationId) => {
    const campaign = await getCampaign(db, id, congregationId)
    if (campaign == null) throw redirect('/territories/attributions/campaigns')
    const [progress, references] = await Promise.all([
      getCampaignProgress(db, campaign, congregationId),
      countCampaignReferences(db, campaign.id, congregationId),
    ])

    // Days, read in the convention they were saved with: the page shows calendar days, never instants.
    const status = getCampaignStatus(campaign)
    const today = formatLocalDate(new Date())
    const endDay = formatLocalDate(campaign.endDate)
    const endedDay = campaign.endedAt != null ? formatLocalDate(campaign.endedAt) : null
    const restDays = campaign.restPeriodDays ?? RESTING_PERIOD_DAYS.campaign
    const tiles = scopeTiles(progress.territories, progress.attributions)
    const attributions = progress.attributions.map(attribution => ({
      id: attribution.id,
      territory: { id: attribution.territory.id, number: attribution.territory.number },
      publisher: formatPersonName(attribution.publisher),
      startDay: formatLocalDate(attribution.startDate),
      endDay: attribution.endDate != null ? formatLocalDate(attribution.endDate) : null,
    }))
    const out = attributions.filter(attribution => attribution.endDay == null).length

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        notes: campaign.notes,
        startDay: formatLocalDate(campaign.startDate),
        endDay,
        endedDay,
        restDays,
        startRegularAction: campaign.startRegularAction,
        startAutoReassign: campaign.startAutoReassign,
        endCloseCampaign: campaign.endCloseCampaign,
        endRegularAction: campaign.endRegularAction,
        allTerritories: campaign.scope.length === 0,
      },
      status,
      today,
      steps: campaignStepStates(status, { today, endDay: endedDay ?? endDay, restDays }),
      tiles,
      attributions,
      metrics: {
        worked: tiles.filter(tile => tile.state !== 'todo').length,
        total: tiles.length,
        out,
        back: attributions.length - out,
      },
      pausedCount: progress.pausedCount,
      canAssign: permissions.has(Permission.CanManageTerritoryAttributions),
      // An active campaign ends first; one any attribution points at stays for the history.
      canDelete: status !== 'active' && references === 0,
    }
  })
}

export default function CampaignView({ loaderData }: Route.ComponentProps) {
  const { campaign, status, today, steps, tiles, attributions, metrics, pausedCount, canAssign, canDelete } = loaderData
  const length = campaignLength(campaign.startDay, campaign.endDay)
  const scope = campaign.allTerritories
    ? m.campaigns_scope_all()
    : metrics.total > 1
      ? m.campaigns_scope_count({ count: metrics.total })
      : m.campaigns_scope_one({ count: metrics.total })

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader
        icon={CalendarRange}
        title={campaign.name}
        titleBadge={<CampaignStateTag status={status} />}
        subtitle={[
          formatCampaignRange(campaign.startDay, campaign.endDay),
          length > 1 ? m.campaigns_length_other({ count: length }) : m.campaigns_length_one({ count: length }),
          scope,
        ].join(' · ')}
        breadcrumbs={[
          { label: m.sidebar_attributions(), to: '/territories/attributions' },
          { label: m.campaigns_title(), to: '/territories/attributions/campaigns' },
          { label: campaign.name },
        ]}
        actions={
          <CampaignActions
            campaign={campaign}
            status={status}
            outCount={metrics.out}
            pausedCount={pausedCount}
            canAssign={canAssign}
            canDelete={canDelete}
          />
        }
      />

      <CampaignMetrics status={status} campaign={campaign} metrics={metrics} today={today} />

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_34rem] flex-col gap-5">
          <CampaignAttributionTable rows={attributions} today={today} ended={status === 'ended'} />
          {tiles.length > 0 && <CampaignScopeTiles tiles={tiles} />}
        </div>
        <aside className="flex min-w-0 flex-[1_1_18rem] flex-col gap-5">
          <CampaignTimeline
            steps={steps}
            preview={previewCampaignLifecycle(campaign)}
            startDay={campaign.startDay}
            endDay={campaign.endedDay ?? campaign.endDay}
            restDays={campaign.restDays}
          />
          {campaign.notes.length > 0 && (
            <Panel title={m.campaigns_view_notes_title()} padded>
              <p className="whitespace-pre-line text-muted-foreground text-sm">{campaign.notes}</p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}

type ViewData = Route.ComponentProps['loaderData']

/** Four figures: how much of the scope is covered, what is out, what came back, and how long it has left. */
function CampaignMetrics({
  status,
  campaign,
  metrics,
  today,
}: Pick<ViewData, 'status' | 'campaign' | 'metrics' | 'today'>) {
  const percent = metrics.total === 0 ? 0 : Math.round((metrics.worked / metrics.total) * 100)
  const days = (count: number) => (count > 1 ? m.campaigns_metric_days_other() : m.campaigns_metric_days_one())
  const left = daysBetween(today, campaign.endDay) + 1
  const until = daysBetween(today, campaign.startDay)
  const length = campaignLength(campaign.startDay, campaign.endDay)

  return (
    <MetricStrip aria-label={m.campaigns_metrics_label()}>
      <StatTile
        label={m.campaigns_metric_coverage()}
        value={metrics.worked}
        unit={m.campaigns_metric_coverage_unit({ total: metrics.total })}
        meter={<ProgressBar value={metrics.worked} max={Math.max(metrics.total, 1)} />}
        foot={m.campaigns_metric_coverage_foot({ percent })}
      />
      <StatTile label={m.campaigns_metric_out()} value={metrics.out} foot={m.campaigns_metric_out_foot()} />
      <StatTile label={m.campaigns_metric_back()} value={metrics.back} foot={m.campaigns_metric_back_foot()} />
      {status === 'active' ? (
        <StatTile
          label={m.campaigns_metric_left()}
          value={Math.max(left, 0)}
          unit={days(left)}
          foot={m.campaigns_metric_left_foot({ date: formatCampaignDay(campaign.endDay) })}
        />
      ) : status === 'scheduled' ? (
        <StatTile
          label={m.campaigns_metric_starts()}
          value={Math.max(until, 0)}
          unit={days(until)}
          foot={m.campaigns_metric_starts_foot({ date: formatCampaignDay(campaign.startDay) })}
        />
      ) : (
        <StatTile
          label={m.campaigns_metric_length()}
          value={length}
          unit={days(length)}
          foot={m.campaigns_metric_length_foot({ date: formatCampaignDay(campaign.endedDay ?? campaign.endDay) })}
        />
      )}
    </MetricStrip>
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
