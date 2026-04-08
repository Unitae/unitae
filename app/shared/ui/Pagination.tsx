import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSearchParams } from 'react-router'
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
    <div className="my-3 flex items-center justify-between gap-6 max-sm:flex-col-reverse">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        {total > 25 && (
          <>
            <Select defaultValue={String(size)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-[80px]">
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
            <span>sur {total.toLocaleString()} résultats</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        {page > 1 && (
          <Button variant="ghost" size="sm" onClick={() => handlePageChange(page - 1)}>
            <ChevronLeft className="size-4" />
            Précédent
          </Button>
        )}
        {page < pages && (
          <Button variant="ghost" size="sm" onClick={() => handlePageChange(page + 1)}>
            Suivant
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
