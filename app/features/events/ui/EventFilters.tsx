import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { Form, useSearchParams } from 'react-router'
import type { SanitizedUser } from '~/features/authentication/server/sanitize-user.server'

interface EventFiltersProps {
  action?: string
  publishers?: SanitizedUser[]
}

export default function EventFilters({ action, publishers = [] }: EventFiltersProps) {
  const [params] = useSearchParams()

  return (
    <Form className="flex flex-col" action={action}>
      <span className="font-medium text-sm">Filtres :</span>
      <div className="flex flex-wrap gap-3">
        <input
          type="date"
          name="date"
          className="inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
          defaultValue={params.get('date') ?? new Date().toISOString().split('T')[0]}
        />

        <button
          className="inline-flex flex-row items-center justify-center gap-1 rounded-md border border-slate-300 bg-slate-300 px-2 py-1 text-slate-500 shadow-slate-50 hover:border-teal-600 hover:text-teal-600 hover:shadow-lg"
          type="submit"
        >
          <AdjustmentsHorizontalIcon className="size-6 text-teal-600" />
          Filtrer
        </button>
      </div>
    </Form>
  )
}
