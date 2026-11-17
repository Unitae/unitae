import type { HelpArticleView } from '~/features/help/model/help.type'

export type HelpPanelState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; view: HelpArticleView }

/**
 * What the side panel shows for the slug it was asked for. While a request is in flight, or when the data on hand is
 * for another slug, the panel is loading: a stale article never shows under a new slug. A failed load stays in the
 * panel as an error.
 */
export function helpPanelState(
  slug: string,
  view: HelpArticleView | undefined,
  fetcherState: 'idle' | 'loading' | 'submitting',
): HelpPanelState {
  if (fetcherState !== 'idle' || view == null || view.slug !== slug) return { kind: 'loading' }
  if (view.kind === 'error') return { kind: 'error' }
  return { kind: 'ready', view }
}
