import { navGroupFor } from '~/shared/ui/navigation-config'

export interface BreadcrumbEntry {
  label: string
  to?: string
}

/**
 * The trail drawn in a page's top bar: the sidebar group the page belongs to,
 * then its crumbs, the last one being the page itself. The group comes from the
 * URL so the 90-odd pages need not repeat it, and is skipped when the first
 * crumb already names it.
 */
export function trailFor(pathname: string, crumbs: BreadcrumbEntry[]): BreadcrumbEntry[] {
  const group = navGroupFor(pathname)
  if (!group || crumbs[0]?.label === group) return crumbs
  return [{ label: group }, ...crumbs]
}
