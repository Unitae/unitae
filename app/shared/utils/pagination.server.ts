export function paginationFromUrl(url: URL, count: number) {
  const page = Number.parseInt(url.searchParams.get('page') || '1', 10)
  const size = Number.parseInt(url.searchParams.get('pageSize') || '25', 10)
  const offset = (page - 1) * size
  const pages = Math.ceil(count / size)

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
 * Validation guards against arbitrary user input flowing into orderBy.
 */
export function sortFromUrl(url: URL, allowed: SortMode[], fallback: SortMode): SortMode {
  const raw = url.searchParams.get('sort')
  if (raw != null && (allowed as string[]).includes(raw)) return raw as SortMode
  return fallback
}
