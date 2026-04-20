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
