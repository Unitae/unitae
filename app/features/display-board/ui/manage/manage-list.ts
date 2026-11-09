import type { ManagedItem } from '~/features/display-board/server/board-management.queries'
import type { ManageSection } from '~/features/display-board/ui/manage/ManageTable'
import { itemKey } from '~/features/display-board/ui/manage/manage-rights'
import { getLocale } from '~/i18n/paraglide/runtime'

/** The rows the URL's search and filters keep; with a search or a state filter on, sections left empty are hidden. */
export function filterSections(sections: ManageSection[], params: URLSearchParams): ManageSection[] {
  const query = (params.get('q') ?? '').trim().toLocaleLowerCase(getLocale())
  const section = params.get('section')
  const state = params.get('etat')
  return sections
    .filter(s => !section || String(s.id) === section)
    .map(s => ({
      ...s,
      items: s.items.filter(
        item =>
          (!query || item.title.toLocaleLowerCase(getLocale()).includes(query)) &&
          (!state || item.state.kind === state),
      ),
    }))
    .filter(s => (!query && !state) || s.items.length > 0)
}

/**
 * A reorder made on the visible rows, laid back into the whole section: the rows a search or a filter
 * hides keep their places, and the visible ones fill the slots they held, in their new order. Sending
 * only the visible rows would number them from zero and push them in among the hidden ones.
 */
export function mergeVisibleOrder(all: ManagedItem[], visible: ManagedItem[]): ManagedItem[] {
  const shown = new Set(visible.map(itemKey))
  const queue = [...visible]
  return all.map(item => (shown.has(itemKey(item)) ? (queue.shift() ?? item) : item))
}

/** How the board's write routes name a row: `dyn` for a dynamic document. A type, so it is JSON to the router. */
export type ItemPayload = {
  kind: string
  id: number
}

export const toPayload = (item: Pick<ManagedItem, 'kind' | 'id'>): ItemPayload => ({
  kind: item.kind === 'pdf' ? 'pdf' : 'dyn',
  id: item.id,
})

const payloadKey = (payload: ItemPayload) => `${payload.kind === 'pdf' ? 'pdf' : 'dynamic'}-${payload.id}`

/** While a reorder is on its way, the order it sends rather than the one it replaces. */
export function withPendingOrder(sections: ManageSection[], pending: ItemPayload[] | undefined): ManageSection[] {
  if (!pending) return sections
  const rank = new Map(pending.map((p, index) => [payloadKey(p), index]))
  return sections.map(s => ({
    ...s,
    items: [...s.items].sort((a, b) => (rank.get(itemKey(a)) ?? 0) - (rank.get(itemKey(b)) ?? 0)),
  }))
}

export interface PendingHighlight {
  items: ItemPayload[]
  highlighted: boolean
}

/** While « à la une » is on its way, the rows already show where it puts them. */
export function withPendingHighlight(
  sections: ManageSection[],
  pending: PendingHighlight | undefined,
): ManageSection[] {
  if (!pending) return sections
  const keys = new Set(pending.items.map(payloadKey))
  return sections.map(s => ({
    ...s,
    items: s.items.map(item => (keys.has(itemKey(item)) ? { ...item, isHighlighted: pending.highlighted } : item)),
  }))
}
