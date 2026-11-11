import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  CreditCard,
  HardDrive,
  type LucideIcon,
  Map as MapIcon,
  MapPin,
  Mic,
  Settings,
  Shield,
  UserCog,
  Users,
} from 'lucide-react'
import * as m from '~/i18n/paraglide/messages'

/** The parts of Réglages. Which ones a viewer may open is decided by the settings feature. */
export type SettingsEntryKey =
  | 'general'
  | 'publishers'
  | 'templates'
  | 'part-types'
  | 'external-speakers'
  | 'territories'
  | 'map'
  | 'users'
  | 'roles'
  | 'data'
  | 'audit'
  | 'subscription'

/** A part of Réglages the viewer may open, for the sidebar's entry and the command palette. */
export interface SettingsLink {
  key: SettingsEntryKey
  href: string
}

/** How each part is named and drawn, in the column of Réglages and in the command palette. */
export const SETTINGS_ENTRY_DISPLAY: Record<SettingsEntryKey, { label: () => string; icon: LucideIcon }> = {
  general: { label: m.settings_entry_general, icon: Settings },
  publishers: { label: m.settings_entry_publishers, icon: Users },
  templates: { label: m.settings_entry_templates, icon: CalendarDays },
  'part-types': { label: m.settings_entry_part_types, icon: BookOpen },
  'external-speakers': { label: m.settings_entry_external_speakers, icon: Mic },
  territories: { label: m.settings_entry_territories, icon: MapIcon },
  map: { label: m.settings_entry_map, icon: MapPin },
  users: { label: m.settings_entry_users, icon: UserCog },
  roles: { label: m.settings_entry_roles, icon: Shield },
  data: { label: m.settings_entry_data, icon: HardDrive },
  audit: { label: m.settings_entry_audit, icon: ClipboardList },
  subscription: { label: m.settings_entry_subscription, icon: CreditCard },
}
