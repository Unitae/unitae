import type { SettingsGroup, SettingsGroupKey } from '~/features/settings/settings-sections'
import * as m from '~/i18n/paraglide/messages'
import { SectionRail } from '~/shared/ui/SectionRail'
import { SETTINGS_ENTRY_DISPLAY } from '~/shared/ui/settings-entries'

export const SETTINGS_GROUP_LABEL: Record<SettingsGroupKey, () => string> = {
  congregation: m.settings_group_congregation,
  access: m.settings_group_access,
  data: m.settings_group_data,
  account: m.settings_group_account,
}

/** The column of Réglages: the parts the viewer may open, under Assemblée, Accès, Données and Compte. */
export function SettingsRail({ groups, className }: { groups: SettingsGroup[]; className?: string }) {
  return (
    <SectionRail
      label={m.settings_title()}
      className={className}
      groups={groups.map(group => ({
        label: SETTINGS_GROUP_LABEL[group.key](),
        items: group.entries.map(entry => ({
          to: entry.href,
          label: SETTINGS_ENTRY_DISPLAY[entry.key].label(),
          icon: SETTINGS_ENTRY_DISPLAY[entry.key].icon,
          external: entry.external ? { hint: m.settings_external_hint() } : undefined,
        })),
      }))}
    />
  )
}
