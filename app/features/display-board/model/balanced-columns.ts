// Splitting a list into columns that read in order — down the first, then the next — and end as
// evenly as possible. Balanced by height, not by count, so an entry that wraps onto two lines or
// a group taller than the others doesn't leave one column hanging.

function prefixSums(heights: number[]): number[] {
  const sums = [0]
  for (const height of heights) sums.push(sums[sums.length - 1] + height)
  return sums
}

/**
 * The order-preserving split into `count` columns whose tallest is as short as possible.
 * Columns may come out empty when there are fewer items than columns.
 */
export function balancedColumns<T>(items: T[], count: number, heightOf: (item: T) => number): T[][] {
  const sums = prefixSums(items.map(heightOf))
  const span = (from: number, to: number) => sums[to] - sums[from]
  let best: number[] = []
  let bestHeights: number[] | null = null
  // Shortest tallest column first; on a tie, no column left short (« 3 2 2 », not « 3 3 1 »),
  // then the first columns the fuller ones, as a reader expects.
  const better = (heights: number[], than: number[]) => {
    if (Math.max(...heights) !== Math.max(...than)) return Math.max(...heights) < Math.max(...than)
    if (Math.min(...heights) !== Math.min(...than)) return Math.min(...heights) > Math.min(...than)
    const index = heights.findIndex((height, column) => height !== than[column])
    return index >= 0 && heights[index] > than[index]
  }
  // Tries every set of cut points; the lists are a group's members or a page of groups, so
  // even three columns of a hundred names stay well under a million spans.
  const search = (start: number, cuts: number[], tallest: number) => {
    if (bestHeights && tallest > Math.max(...bestHeights)) return
    if (cuts.length === count - 1) {
      const bounds = [0, ...cuts, items.length]
      const heights = bounds.slice(1).map((end, index) => span(bounds[index], end))
      if (!bestHeights || better(heights, bestHeights)) {
        best = cuts
        bestHeights = heights
      }
      return
    }
    for (let cut = start; cut <= items.length; cut++) search(cut, [...cuts, cut], Math.max(tallest, span(start, cut)))
  }
  search(0, [], 0)
  const bounds = [0, ...best, items.length]
  return bounds.slice(1).map((end, index) => items.slice(bounds[index], end))
}
