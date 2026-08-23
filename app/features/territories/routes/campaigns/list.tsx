import { Megaphone, Pencil, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { getCampaignStatus } from '~/features/territories/model/campaign-status'
import { listCampaigns } from '~/features/territories/server/campaign.queries'
import { CampaignStatusBadge } from '~/features/territories/ui/CampaignStatusBadge'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, requirePermission, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/shared/ui/table'

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
  const navigate = useNavigate()

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.campaigns_table_name()}</TableHead>
              <TableHead>{m.campaigns_table_dates()}</TableHead>
              <TableHead className="max-sm:hidden">{m.campaigns_table_scope()}</TableHead>
              <TableHead>{m.campaigns_table_status()}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map(campaign => (
              <TableRow
                key={campaign.id}
                className="cursor-pointer hover:bg-accent/30"
                onClick={event => {
                  if (event.defaultPrevented) return
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                  if ((event.target as HTMLElement).closest('a, button, [role="button"]')) return
                  navigate(`/territories/campaigns/${campaign.id}`)
                }}
              >
                <TableCell className="font-medium">
                  <Link to={`/territories/campaigns/${campaign.id}`} className="hover:text-primary">
                    {campaign.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {new Date(campaign.startDate).toLocaleDateString('fr-FR')} –{' '}
                  {new Date(campaign.endDate).toLocaleDateString('fr-FR')}
                </TableCell>
                <TableCell className="text-muted-foreground max-sm:hidden">
                  {campaign.scopeCount === 0
                    ? m.campaigns_scope_all()
                    : m.campaigns_scope_count({ count: campaign.scopeCount })}
                </TableCell>
                <TableCell>
                  <CampaignStatusBadge status={getCampaignStatus(campaign)} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" asChild>
                    <Link to={`/territories/campaigns/${campaign.id}/edit`} title={m.campaigns_edit_button()}>
                      <Pencil className="size-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
