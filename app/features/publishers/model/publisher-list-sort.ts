import type { PublisherSort } from '~/features/publishers/model/publisher-list-filters'

interface SortableRow {
  lastname: string
  firstname: string
  group: { name: string } | null
}

/**
 * The rows in the chosen order. The server already sorts by name, or by departure for those who left; by group,
 * the groups come in the order a reader counts (« Groupe 2 » before « Groupe 10 »), each by name, those in no
 * group last.
 */
export function sortPublisherRows<R extends SortableRow>(rows: R[], sort: PublisherSort, locale: string): R[] {
  if (sort !== 'group') return rows
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  return [...rows].sort((a, b) => {
    if (a.group == null || b.group == null) {
      if (a.group !== b.group) return a.group == null ? 1 : -1
    } else {
      const byGroup = collator.compare(a.group.name, b.group.name)
      if (byGroup !== 0) return byGroup
    }
    return collator.compare(a.lastname, b.lastname) || collator.compare(a.firstname, b.firstname)
  })
}
