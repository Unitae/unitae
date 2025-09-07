import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import { useSearchParams } from 'react-router'

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
  const handlePageSizeChange = (size: number) => {
    searchParams.set('pageSize', String(size))
    setSearchParams(searchParams)
  }

  return (
    <div className="my-3 flex items-center justify-between gap-6 max-sm:flex-col-reverse">
      <div>
        {total > 25 && (
          <>
            <select
              className="mr-3 inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-center text-slate-950 max-sm:flex-1"
              name="access"
              defaultValue={size}
              onChange={e => handlePageSizeChange(Number(e.target.value))}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              {total > 50 && <option value={100}>100</option>}
              {total > 100 && <option value={250}>250</option>}
              {total > 250 && <option value={500}>500</option>}
              {total > 500 && <option value={1000}>1000</option>}
              {total > 1000 && <option value={2000}>2000</option>}
            </select>
            sur {total.toLocaleString()} résultats
          </>
        )}
      </div>
      <div className="">
        {page > 1 && (
          <button type="button" className="m-2 hover:text-teal-600" onClick={() => handlePageChange(page - 1)}>
            <ArrowLeftIcon className="inline size-6" /> Précédent
          </button>
        )}
        {page < pages && (
          <button type="button" className="m-2 hover:text-teal-600" onClick={() => handlePageChange(page + 1)}>
            Suivant <ArrowRightIcon className="inline size-6" />
          </button>
        )}
      </div>
    </div>
  )
}
