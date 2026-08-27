import {
  Building2,
  ClipboardList,
  CreditCard,
  HardDrive,
  Map as MapIcon,
  Settings,
  Shield,
  UserCog,
} from 'lucide-react'
import { redirect } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext, permissionsContext } from '~/shared/auth/route-context.server'
import { billingEntryUrl } from '~/shared/domain/billing-link.server'
import { Permission } from '~/shared/types/permission'
import {
  buildSettingsSections,
  type SettingsCard,
  type SettingsGroupKey,
  type SettingsItemKey,
} from '../settings-sections'
import { SettingsNavCard } from '../ui/SettingsNavCard'
import type { Route } from './+types/index'

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const congregation = context.get(congregationContext)

  const perms = {
    canManageSettings: permissions.has(Permission.CanConfigureCongregation),
    canManageUsers: permissions.has(Permission.CanManageUsers),
    canManagePermissions: permissions.has(Permission.CanConfigurePermissions),
    canManagePioneerGoals: permissions.has(Permission.CanSetPioneerGoals),
  }

  const billingUrl = billingEntryUrl({
    isAdmin: perms.canManageSettings,
    stripeCustomerId: congregation.stripeCustomerId,
    slug: congregation.slug,
  })

  const sections = buildSettingsSections(perms, billingUrl)
  if (sections.length === 0) {
    throw redirect('/')
  }

  return { sections }
}

type IconComponent = React.ComponentType<{ className?: string }>

const ITEM_DISPLAY: Record<SettingsItemKey, { icon: IconComponent; title: () => string; description: () => string }> = {
  general: { icon: Settings, title: m.sidebar_settings_general, description: m.settings_hub_general_desc },
  subscription: { icon: CreditCard, title: m.sidebar_subscription, description: m.settings_hub_subscription_desc },
  congregation: { icon: Building2, title: m.sidebar_settings_assembly, description: m.settings_hub_congregation_desc },
  territories: { icon: MapIcon, title: m.sidebar_settings_territories, description: m.settings_hub_territories_desc },
  users: { icon: UserCog, title: m.sidebar_users, description: m.settings_hub_users_desc },
  permissions: { icon: Shield, title: m.sidebar_settings_permissions, description: m.settings_hub_permissions_desc },
  data: { icon: HardDrive, title: m.sidebar_settings_data, description: m.settings_hub_data_desc },
  audit: { icon: ClipboardList, title: m.sidebar_audit_log, description: m.settings_hub_audit_desc },
}

const GROUP_TITLE: Record<SettingsGroupKey, () => string> = {
  account: m.settings_hub_group_account,
  modules: m.settings_hub_group_modules,
  access: m.settings_hub_group_access,
  data: m.settings_hub_group_data,
}

function SettingsCardLink({ item }: { item: SettingsCard }) {
  const display = ITEM_DISPLAY[item.key]
  return (
    <SettingsNavCard
      icon={display.icon}
      title={display.title()}
      description={display.description()}
      href={item.href}
      external={item.external}
    />
  )
}

export default function SettingsHub({ loaderData }: Route.ComponentProps) {
  const { sections } = loaderData

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <h1 className="font-bold font-display text-2xl text-foreground">{m.settings_hub_title()}</h1>
      <p className="mt-1 text-muted-foreground">{m.settings_hub_subtitle()}</p>

      <div className="mt-8 space-y-8">
        {sections.map(section => (
          <section key={section.key}>
            <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {GROUP_TITLE[section.key]()}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {section.items.map(item => (
                <SettingsCardLink key={item.key} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
