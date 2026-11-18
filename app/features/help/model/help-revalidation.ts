import type { ShouldRevalidateFunctionArgs } from 'react-router'
import { HELP_PANEL_PARAM } from '~/features/help/model/help-links'

/**
 * The `shouldRevalidate` of every route that sits under a « ? »: opening, closing or swapping the article in the side
 * panel changes only `?help=`, so the page keeps the data it has and the panel fetches the article alone. Any other
 * change (another page, another parameter, a form sent) is left to React Router's default.
 *
 * Every route matched under the « ? » needs it, layouts included: one route that reloads is enough to send the
 * request again.
 */
export function skipRevalidationForHelpPanel(args: ShouldRevalidateFunctionArgs): boolean {
  return onlyHelpPanelChanged(args) ? false : args.defaultShouldRevalidate
}

/**
 * Whether the navigation only opens, closes or swaps the article in the side panel. A page that decides its own
 * revalidation keeps its data when this is true, as `skipRevalidationForHelpPanel` does.
 */
export function onlyHelpPanelChanged({
  currentUrl,
  nextUrl,
  formMethod,
}: Pick<ShouldRevalidateFunctionArgs, 'currentUrl' | 'nextUrl' | 'formMethod'>): boolean {
  if (formMethod != null || currentUrl.pathname !== nextUrl.pathname) return false
  if (currentUrl.searchParams.get(HELP_PANEL_PARAM) === nextUrl.searchParams.get(HELP_PANEL_PARAM)) return false
  return withoutPanel(currentUrl) === withoutPanel(nextUrl)
}

function withoutPanel(url: URL): string {
  const params = new URLSearchParams(url.searchParams)
  params.delete(HELP_PANEL_PARAM)
  params.sort()
  return params.toString()
}
