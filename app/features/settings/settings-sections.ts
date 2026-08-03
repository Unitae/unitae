// Structure of the Settings hub (/settings): which cards appear, grouped and ordered, given the
// viewer's permissions and whether billing is configured. Pure so it can be unit-tested; the page
// component decorates each key with an icon, title and description.

export type SettingsItemKey =
  | 'general'
  | 'subscription'
  | 'congregation'
  | 'territories'
  | 'users'
  | 'permissions'
  | 'data'
  | 'audit'

export type SettingsGroupKey = 'account' | 'modules' | 'access' | 'data'

export interface SettingsSectionPerms {
  canManageSettings: boolean
  canManageUsers: boolean
  canManagePermissions: boolean
  canManagePioneerGoals: boolean
}

export interface SettingsCard {
  key: SettingsItemKey
  href: string
  external: boolean
}

export interface SettingsSection {
  key: SettingsGroupKey
  items: SettingsCard[]
}

interface CatalogEntry {
  key: SettingsItemKey
  group: SettingsGroupKey
  href: string
  external: boolean
  visible: (perms: SettingsSectionPerms, hasBilling: boolean) => boolean
}

const CATALOG: CatalogEntry[] = [
  { key: 'general', group: 'account', href: '/settings/general', external: false, visible: p => p.canManageSettings },
  { key: 'subscription', group: 'account', href: '', external: true, visible: (_p, hasBilling) => hasBilling },
  {
    key: 'congregation',
    group: 'modules',
    href: '/settings/congregation',
    // Parent card of the congregation module — aggregates its sub-settings' permissions (the
    // congregation settings themselves need Admin; pioneer goals live inside and need their own
    // PioneerGoalManager). The page renders only the sub-sections the viewer may access.
    external: false,
    visible: p => p.canManageSettings || p.canManagePioneerGoals,
  },
  {
    key: 'territories',
    group: 'modules',
    href: '/settings/territories',
    external: false,
    visible: p => p.canManageSettings,
  },
  { key: 'users', group: 'access', href: '/settings/users', external: false, visible: p => p.canManageUsers },
  {
    key: 'permissions',
    group: 'access',
    href: '/settings/permissions',
    external: false,
    visible: p => p.canManagePermissions,
  },
  { key: 'data', group: 'data', href: '/settings/data', external: false, visible: p => p.canManageSettings },
  { key: 'audit', group: 'data', href: '/settings/audit-log', external: false, visible: p => p.canManageSettings },
]

// Rank per group. Typed as a Record (not an array) so adding a SettingsGroupKey fails to compile
// until it is ranked here — otherwise its cards would silently never render.
const GROUP_RANK: Record<SettingsGroupKey, number> = { account: 0, modules: 1, access: 2, data: 3 }
const GROUP_ORDER = (Object.keys(GROUP_RANK) as SettingsGroupKey[]).sort((a, b) => GROUP_RANK[a] - GROUP_RANK[b])

export function buildSettingsSections(perms: SettingsSectionPerms, billingUrl: string | null): SettingsSection[] {
  const hasBilling = billingUrl !== null
  const sections: SettingsSection[] = []

  for (const group of GROUP_ORDER) {
    const items = CATALOG.filter(entry => entry.group === group && entry.visible(perms, hasBilling)).map(entry => ({
      key: entry.key,
      href: entry.key === 'subscription' ? (billingUrl ?? '') : entry.href,
      external: entry.external,
    }))
    if (items.length > 0) sections.push({ key: group, items })
  }

  return sections
}
