import { getLocale } from '~/i18n/paraglide/runtime'

export function distinct(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, getLocale()))
}
