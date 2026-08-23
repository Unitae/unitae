import { Megaphone, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { getCampaignStatus } from '~/features/territories/model/campaign-status'
import { listCampaigns } from '~/features/territories/server/campaign.queries'
import { CampaignStatusBadge } from '~/features/territories/ui/CampaignStatusBadge'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.campaigns_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.TerritoriesManager)

  return withScopeFromContext(context, async (db, congregationId) => {
    const campaigns = await listCampaigns(db, congregationId)
    return {
      campaigns: campaigns.map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        activatedAt: campaign.activatedAt,
        endedAt: campaign.endedAt,
        scopeCount: campaign._count.scope,
      })),
    }
  })
}

export default function CampaignsList({ loaderData }: Route.ComponentProps) {
  const { campaigns } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.campaigns_title()}
        subtitle={m.campaigns_subtitle()}
        breadcrumbs={[{ label: m.campaigns_title() }]}
        actions={
          <Button asChild>
            <Link to="/territories/campaigns/new">
              <Plus />
              {m.campaigns_new_button()}
            </Link>
          </Button>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState icon={Megaphone} title={m.campaigns_empty()} description={m.campaigns_empty_description()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map(campaign => (
            <Link key={campaign.id} to={`/territories/campaigns/${campaign.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/30">
                <CardHeader>
                  <CardTitle className="truncate">{campaign.name}</CardTitle>
                  <CardAction>
                    <CampaignStatusBadge status={getCampaignStatus(campaign)} />
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-1 text-muted-foreground text-sm">
                  <span>
                    {new Date(campaign.startDate).toLocaleDateString('fr-FR')} –{' '}
                    {new Date(campaign.endDate).toLocaleDateString('fr-FR')}
                  </span>
                  <span>
                    {campaign.scopeCount === 0
                      ? m.campaigns_scope_all()
                      : m.campaigns_scope_count({ count: campaign.scopeCount })}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
