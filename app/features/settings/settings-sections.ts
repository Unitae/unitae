// The parts of Réglages: which ones a viewer may open, grouped and ordered as the column lists them. Pure so the
// settings gate, the sidebar entry, the /settings page and the column all read the same rules; the column decorates
// each key with an icon and a label.

import { Permission } from '~/shared/types/permission'
import type { SettingsEntryKey, SettingsLink } from '~/shared/ui/settings-entries'

export type { SettingsEntryKey }

export type SettingsGroupKey = 'congregation' | 'access' | 'data' | 'account'

/** What decides the parts a viewer sees: their rights, and whether a role they hold runs a programme template. */
export interface SettingsAccess {
  permissions: ReadonlySet<Permission>
  /** Template responsibility is held through a role, not a right: it opens the templates alone. */
  templateResponsible: boolean
}

export interface SettingsEntry {
  key: SettingsEntryKey
  href: string
  external: boolean
}

export interface SettingsGroup {
  key: SettingsGroupKey
  entries: SettingsEntry[]
}

interface CatalogEntry {
  key: Exclude<SettingsEntryKey, 'subscription'>
  group: Exclude<SettingsGroupKey, 'account'>
  href: string
  /** Each part opens with the right its own page checks, so nobody is shown a part that would turn them away. */
  opens: (can: (permission: Permission) => boolean, access: SettingsAccess) => boolean
}

const CATALOG: CatalogEntry[] = [
  {
    key: 'general',
    group: 'congregation',
    href: '/settings/general',
    opens: can => can(Permission.CanConfigureCongregation),
  },
  {
    key: 'publishers',
    group: 'congregation',
    href: '/settings/publishers',
    opens: can => can(Permission.CanConfigureCongregation) || can(Permission.CanSetPioneerGoals),
  },
  {
    key: 'templates',
    group: 'congregation',
    href: '/settings/templates',
    opens: (can, access) => can(Permission.CanManageProgramTemplates) || access.templateResponsible,
  },
  {
    key: 'part-types',
    group: 'congregation',
    href: '/settings/part-types',
    // Part types are edited by the programme managers, and seen by whoever builds templates from them.
    opens: can => can(Permission.CanManagePrograms) || can(Permission.CanManageProgramTemplates),
  },
  {
    key: 'territories',
    group: 'congregation',
    href: '/settings/territories',
    opens: can => can(Permission.CanConfigureTerritorySettings),
  },
  {
    key: 'map',
    group: 'congregation',
    href: '/settings/map',
    opens: can => can(Permission.CanConfigureTerritorySettings),
  },
  {
    key: 'users',
    group: 'access',
    href: '/settings/users',
    opens: can => can(Permission.CanViewUsers) || can(Permission.CanManageUsers),
  },
  { key: 'roles', group: 'access', href: '/settings/roles', opens: can => can(Permission.CanConfigurePermissions) },
  {
    key: 'data',
    group: 'data',
    href: '/settings/data',
    // An import restores roles, rights and accounts, so it can grant anything: the page asks for the administrator too.
    opens: can =>
      can(Permission.CanExportCongregationData) ||
      (can(Permission.CanImportCongregationData) && can(Permission.CanDoAnything)),
  },
  { key: 'audit', group: 'data', href: '/settings/audit-log', opens: can => can(Permission.CanConfigureCongregation) },
]

const GROUP_ORDER: Exclude<SettingsGroupKey, 'account'>[] = ['congregation', 'access', 'data']

function openEntries(access: SettingsAccess): CatalogEntry[] {
  const can = (permission: Permission) => access.permissions.has(permission)
  return CATALOG.filter(entry => entry.opens(can, access))
}

/** The column of Réglages: the parts the viewer may open, then the subscription when billing is set up. */
export function settingsGroups(access: SettingsAccess, billingUrl: string | null): SettingsGroup[] {
  const open = openEntries(access)
  const groups: SettingsGroup[] = GROUP_ORDER.map(key => ({
    key,
    entries: open.filter(entry => entry.group === key).map(({ key, href }) => ({ key, href, external: false })),
  })).filter(group => group.entries.length > 0)

  if (billingUrl != null) {
    groups.push({ key: 'account', entries: [{ key: 'subscription', href: billingUrl, external: true }] })
  }
  return groups
}

/** Whether Réglages shows in the sidebar and lets the viewer in: one part is enough; the subscription is not one. */
export function mayOpenSettings(access: SettingsAccess): boolean {
  return openEntries(access).length > 0
}

/** Where Réglages opens on a wide screen: its first part the viewer may open. */
export function firstSettingsHref(access: SettingsAccess): string | null {
  return openEntries(access)[0]?.href ?? null
}

/** The parts the viewer may open, for the sidebar's entry and the command palette. */
export function settingsLinksFor(access: SettingsAccess): SettingsLink[] {
  return openEntries(access).map(({ key, href }) => ({ key, href }))
}
