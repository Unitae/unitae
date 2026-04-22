import { Outlet } from 'react-router'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  const canUploadDocument = permissions.has(Role.BoardUploader)
  const canViewTerritories = permissions.has(Role.TerritoriesViewer)
  const canManageSettings = permissions.has(Role.SettingsUserManager)
  const canViewPublishers = permissions.has(Role.PublisherViewer)
  const canManageBoard = permissions.has(Role.BoardValidator)
  const canViewProspection = permissions.has(Role.ProspectionViewer)

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
