import type { ManagedItem } from '~/features/display-board/server/board-management.queries'
import { itemKey } from '~/features/display-board/ui/manage/ManagedItemRow'
import type { ManageSection } from '~/features/display-board/ui/manage/ManageTable'

/** The rows the URL's search and filters keep; with a search or a state filter on, sections left empty are hidden. */
export function filterSections(sections: ManageSection[], params: URLSearchParams): ManageSection[] {
  const query = (params.get('q') ?? '').trim().toLocaleLowerCase('fr')
  const section = params.get('section')
  const state = params.get('etat')
  return sections
    .filter(s => !section || String(s.id) === section)
    .map(s => ({
      ...s,
      items: s.items.filter(
        item => (!query || item.title.toLocaleLowerCase('fr').includes(query)) && (!state || item.state.kind === state),
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

/** While a reorder is on its way, the order it sends rather than the one it replaces. */
export function withPendingOrder(
  sections: ManageSection[],
  pending: { kind: string; id: number }[] | undefined,
): ManageSection[] {
  if (!pending) return sections
  const rank = new Map(pending.map((p, index) => [`${p.kind === 'pdf' ? 'pdf' : 'dynamic'}-${p.id}`, index]))
  return sections.map(s => ({
    ...s,
    items: [...s.items].sort((a, b) => (rank.get(itemKey(a)) ?? 0) - (rank.get(itemKey(b)) ?? 0)),
  }))
}
