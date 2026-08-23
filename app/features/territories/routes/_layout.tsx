import { Outlet, redirect } from 'react-router'
import { getActiveCampaign, getUpcomingCampaign } from '~/features/territories/server/campaign.queries'
import { type CampaignBannerData, CampaignModeBanner } from '~/features/territories/ui/CampaignModeBanner'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.territories_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canViewTerritories = permissions.has(Permission.TerritoriesViewer)
  const canManageTerritories = permissions.has(Permission.TerritoriesManager)
  const canManageSettings = permissions.has(Permission.SettingsUserManager)
  const canViewPublishers = permissions.has(Permission.PublisherViewer)
  const canViewProspection = permissions.has(Permission.ProspectionViewer)

  if (!canViewTerritories && !canViewProspection) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const active = await getActiveCampaign(db, congregationId)
    const upcoming = active == null ? await getUpcomingCampaign(db, congregationId, new Date()) : null
    const source = active ?? upcoming
    const bannerCampaign: CampaignBannerData | null =
      source == null
        ? null
        : {
            id: source.id,
            name: source.name,
            startDate: source.startDate,
            endDate: source.endDate,
            status: active != null ? 'active' : 'scheduled',
          }

    return {
      canManageTerritories,
      canViewTerritories,
      canManageSettings,
      canViewPublishers,
      canViewProspection,
      bannerCampaign,
    }
  })
}

export default function BoardLayout({ loaderData }: Route.ComponentProps) {
  const { bannerCampaign, canManageTerritories } = loaderData

  return (
    <div className="flex flex-col gap-4">
      <CampaignModeBanner campaign={bannerCampaign} variant={canManageTerritories ? 'manager' : 'publisher'} />
      <Outlet />
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
