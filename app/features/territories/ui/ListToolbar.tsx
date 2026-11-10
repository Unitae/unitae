import type { ReactNode } from 'react'

interface ListToolbarProps {
  search: ReactNode
  views?: ReactNode
  filters?: ReactNode
  sort?: ReactNode
  /** The active filters, as chips under the row. */
  chips?: ReactNode
}

/**
 * The toolbar of the territory lists, the same on each: the search, the quick views and « Filtres » on one row, the
 * order at its end; the active filters as chips underneath.
 */
export function ListToolbar({ search, views, filters, sort, chips }: ListToolbarProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-48 flex-[0_1_15rem] max-md:basis-full">{search}</div>
        {views}
        {filters}
        <span className="flex-1" />
        {sort}
      </div>
      {chips}
    </div>
  )
}
