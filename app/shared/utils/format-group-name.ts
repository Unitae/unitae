import { getLocale } from '~/i18n/paraglide/runtime'

export function formatGroupName(name: string): string {
  return name.toLocaleUpperCase(getLocale())
}
