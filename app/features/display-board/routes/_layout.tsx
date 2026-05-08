import { Outlet } from 'react-router'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  const canUploadDocument = permissions.has(Permission.BoardUploader)
  const canViewTerritories = permissions.has(Permission.TerritoriesViewer)
  const canManageSettings = permissions.has(Permission.SettingsUserManager)
  const canViewPublishers = permissions.has(Permission.PublisherViewer)
  const canManageBoard = permissions.has(Permission.BoardValidator)
  const canViewProspection = permissions.has(Permission.ProspectionViewer)

  return {
    canManageSettings,
    canViewTerritories,
    canViewPublishers,
    canUploadDocument,
    canManageBoard,
    canViewProspection,
  }
}

export default function BoardLayout({ loaderData }: Route.ComponentProps) {
  const { canUploadDocument } = loaderData

  return <Outlet context={{ canUploadDocument }} />
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
