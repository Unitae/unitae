import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSearchParams } from 'react-router'
import * as m from '~/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

export default function Pagination({
  pages,
  page,
  size,
  total,
}: {
  page: number
  pages: number
  size: number
  total: number
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const handlePageChange = (newPage: number) => {
    searchParams.set('page', String(newPage))
    setSearchParams(searchParams)
  }
  const handlePageSizeChange = (newSize: string) => {
    searchParams.set('pageSize', newSize)
    setSearchParams(searchParams)
  }

  return (
    <div className="flex items-center justify-between gap-2 border-t pt-4 max-sm:flex-col-reverse sm:gap-4">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        {total > 25 && (
          <>
            <Select defaultValue={String(size)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                {total > 50 && <SelectItem value="100">100</SelectItem>}
                {total > 100 && <SelectItem value="250">250</SelectItem>}
                {total > 250 && <SelectItem value="500">500</SelectItem>}
                {total > 500 && <SelectItem value="1000">1000</SelectItem>}
                {total > 1000 && <SelectItem value="2000">2000</SelectItem>}
              </SelectContent>
            </Select>
            <span>{m.pagination_results_total({ total: total.toLocaleString() })}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {m.pagination_page_info({ page: String(page), pages: String(pages) })}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => handlePageChange(page - 1)} disabled={page <= 1}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => handlePageChange(page + 1)} disabled={page >= pages}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
