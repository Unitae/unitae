export function paginationFromUrl(url: URL, count: number) {
  const rawPage = Number.parseInt(url.searchParams.get('page') || '1', 10)
  const size = Number.parseInt(url.searchParams.get('pageSize') || '25', 10)
  const pages = Math.ceil(count / size)
  // Clamp to [1, pages] when there are results — protects against `?page=99`
  // after a filter or geocode hit drops the total. Without this an
  // out-of-range page silently rendered an empty table with no signal.
  const maxPage = Math.max(1, pages)
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(1, rawPage), maxPage) : 1
  const offset = (page - 1) * size

  return {
    total: count,
    previous: page > 1 ? page - 1 : null,
    page,
    next: page < pages ? page + 1 : null,
    pages,
    size,
    offset,
  }
}

// Known sort modes. Pages may accept a subset (territory list takes
// `number | proximity`; attribution list takes `date | proximity`). Callers
// decide which mode to apply.
export type SortMode = 'number' | 'date' | 'proximity'

/**
 * Reads `?sort=` and returns it if valid, otherwise the supplied default.
 * Generic over the allowed subset so callers can narrow downstream branches
 * — `sortFromUrl(url, ['number', 'proximity'], 'number')` returns
 * `'number' | 'proximity'` instead of the wider `SortMode`.
 */
export function sortFromUrl<A extends SortMode>(url: URL, allowed: readonly A[], fallback: A): A {
  const raw = url.searchParams.get('sort')
  if (raw != null && (allowed as readonly string[]).includes(raw)) return raw as A
  return fallback
}
