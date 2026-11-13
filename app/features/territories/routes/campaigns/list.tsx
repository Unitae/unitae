import { CalendarRange, Plus } from 'lucide-react'
import { Link } from 'react-router'

import { getCampaignStatus } from '~/features/territories/model/campaign-status'
import { listCampaigns } from '~/features/territories/server/campaign.queries'
import { listCampaignCoverage } from '~/features/territories/server/campaign-progress.queries'
import { CampaignTable } from '~/features/territories/ui/CampaignTable'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { formatLocalDate } from '~/shared/utils/date.server'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.campaigns_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritoryCampaigns)

  return withScopeFromContext(context, async (db, congregationId) => {
    const campaigns = await listCampaigns(db, congregationId)
    const coverage = await listCampaignCoverage(
      db,
      congregationId,
      campaigns.map(campaign => campaign.id),
    )
    return {
      // Days, read in the convention they were saved with: the page shows calendar days, never instants.
      campaigns: campaigns.map(campaign => {
        const status = getCampaignStatus(campaign)
        return {
          id: campaign.id,
          name: campaign.name,
          startDay: formatLocalDate(campaign.startDate),
          endDay: formatLocalDate(campaign.endDate),
          endedDay: campaign.endedAt != null ? formatLocalDate(campaign.endedAt) : null,
          status,
          scopeCount: campaign._count.scope,
          coverage: status === 'scheduled' ? null : (coverage[campaign.id] ?? null),
        }
      }),
    }
  })
}

export default function CampaignsList({ loaderData }: Route.ComponentProps) {
  const { campaigns } = loaderData
  const active = campaigns.filter(campaign => campaign.status === 'active').length
  const scheduled = campaigns.filter(campaign => campaign.status === 'scheduled').length
  const facts = [
    active > 0 && m.campaigns_count_active({ count: active }),
    scheduled > 0 && m.campaigns_count_scheduled({ count: scheduled }),
  ].filter(Boolean)
  const create = (
    <Button asChild size="sm">
      <Link to="/territories/attributions/campaigns/new">
        <Plus aria-hidden="true" />
        {m.campaigns_new_button()}
      </Link>
    </Button>
  )

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <PageHeader
        title={m.campaigns_title()}
        titleBadge={
          facts.length > 0 ? <span className="text-base text-faint tabular-nums">{facts.join(' · ')}</span> : undefined
        }
        subtitle={m.campaigns_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_attributions(), to: '/territories/attributions' },
          { label: m.campaigns_title() },
        ]}
        actions={campaigns.length > 0 ? create : undefined}
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={m.campaigns_empty()}
          description={m.campaigns_empty_description()}
          action={create}
        />
      ) : (
        <>
          <CampaignTable rows={campaigns} />
          <p className="text-faint text-sm">{m.campaigns_coverage_help()}</p>
        </>
      )}
    </div>
  )
}
