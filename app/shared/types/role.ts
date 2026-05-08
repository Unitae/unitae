import * as m from '~/i18n/paraglide/messages'

interface RoleDisplay {
  key: string
  name: string | null
  description?: string | null
}

const BUILT_IN_NAMES: Record<string, () => string> = {
  male: () => m.role_name_male(),
  female: () => m.role_name_female(),
  publisher: () => m.role_name_publisher(),
  baptized: () => m.role_name_baptized(),
  anointed: () => m.role_name_anointed(),
  elder: () => m.role_name_elder(),
  'assistant-servant': () => m.role_name_assistant_servant(),
}

const BUILT_IN_DESCRIPTIONS: Record<string, () => string> = {
  male: () => m.role_desc_male(),
  female: () => m.role_desc_female(),
  publisher: () => m.role_desc_publisher(),
  baptized: () => m.role_desc_baptized(),
  anointed: () => m.role_desc_anointed(),
  elder: () => m.role_desc_elder(),
  'assistant-servant': () => m.role_desc_assistant_servant(),
}

export function getRoleDisplayName(role: RoleDisplay): string {
  if (role.name) return role.name
  return BUILT_IN_NAMES[role.key]?.() ?? role.key
}

export function getRoleDescription(role: RoleDisplay): string {
  if (role.description) return role.description
  return BUILT_IN_DESCRIPTIONS[role.key]?.() ?? ''
}
