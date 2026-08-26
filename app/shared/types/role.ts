import * as m from '~/i18n/paraglide/messages'

interface RoleDisplay {
  key: string
  name: string | null
  description?: string | null
}

const BUILT_IN_NAMES: Record<string, () => string> = {
  admin: () => m.role_name_admin(),
  member: () => m.role_name_member(),
  'ministry-school-student': () => m.role_name_ministry_school_student(),
  publisher: () => m.role_name_publisher(),
  baptized: () => m.role_name_baptized(),
  brother: () => m.role_name_brother(),
  sister: () => m.role_name_sister(),
  anointed: () => m.role_name_anointed(),
  elder: () => m.role_name_elder(),
  'assistant-servant': () => m.role_name_assistant_servant(),
  pioneer: () => m.role_name_pioneer(),
}

const BUILT_IN_DESCRIPTIONS: Record<string, () => string> = {
  admin: () => m.role_desc_admin(),
  member: () => m.role_desc_member(),
  'ministry-school-student': () => m.role_desc_ministry_school_student(),
  publisher: () => m.role_desc_publisher(),
  baptized: () => m.role_desc_baptized(),
  brother: () => m.role_desc_brother(),
  sister: () => m.role_desc_sister(),
  anointed: () => m.role_desc_anointed(),
  elder: () => m.role_desc_elder(),
  'assistant-servant': () => m.role_desc_assistant_servant(),
  pioneer: () => m.role_desc_pioneer(),
}

export function getRoleDisplayName(role: RoleDisplay): string {
  if (role.name) return role.name
  return BUILT_IN_NAMES[role.key]?.() ?? role.key
}

export function getRoleDescription(role: RoleDisplay): string {
  if (role.description) return role.description
  return BUILT_IN_DESCRIPTIONS[role.key]?.() ?? ''
}
