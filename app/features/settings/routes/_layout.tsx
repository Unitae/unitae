import { Outlet, redirect } from 'react-router'
import { loadSettingsAccess } from '~/features/settings/server/settings-access.server'
import { mayOpenSettings, settingsGroups } from '~/features/settings/settings-sections'
import { SettingsRail } from '~/features/settings/ui/SettingsRail'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { billingEntryUrl } from '~/shared/domain/billing-link.server'
import { Permission } from '~/shared/types/permission'
import type { Route } from './+types/_layout'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_layout_meta_title() }]
}

function accessOf(context: Parameters<typeof withScopeFromContext>[0]) {
  const permissions = context.get(permissionsContext)
  const account = context.get(currentAccountContext)
  return withScopeFromContext(context, (db, congregationId) =>
    loadSettingsAccess(db, permissions, account.id, congregationId),
  )
}

// Whoever may open one part gets in; each part's page still checks its own right.
export const middleware: Route.MiddlewareFunction[] = [
  async ({ context }) => {
    if (!mayOpenSettings(await accessOf(context))) throw redirect('/')
  },
]

export async function loader({ context }: Route.LoaderArgs) {
  const congregation = context.get(congregationContext)
  const access = await accessOf(context)
  const billingUrl = billingEntryUrl({
    isAdmin: access.permissions.has(Permission.CanConfigureCongregation),
    stripeCustomerId: congregation.stripeCustomerId,
    slug: congregation.slug,
  })
  return { groups: settingsGroups(access, billingUrl) }
}

export default function SettingsLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="md:grid md:grid-cols-[12.5rem_minmax(0,1fr)] md:items-start md:gap-9">
      <SettingsRail groups={loaderData.groups} className="max-md:hidden md:mt-12" />
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
