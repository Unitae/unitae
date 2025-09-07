import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import type { PublisherGroup } from '~/database/generated/client'
import { Form, useSearchParams } from 'react-router'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'

interface AttributionFiltersProps {
  action?: string
  phoneTypeActive?: boolean
  groups?: PublisherGroup[]
}

export default function AttributionFilters({ action, phoneTypeActive = false, groups = [] }: AttributionFiltersProps) {
  const [params] = useSearchParams()

  return (
    <Form className="flex flex-col" action={action}>
      <span className="font-medium text-sm">Filtres :</span>
      <div className="flex flex-wrap gap-3">
        <select
          className="inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
          name="type"
          defaultValue={params.get('type') ?? undefined}
        >
          <option value="none">Mode</option>
          <option value={TerritoryAttributionKind.Default}>{phoneTypeActive ? 'Classique' : 'Porte à Porte'}</option>
          {!phoneTypeActive && <option value={TerritoryAttributionKind.Phone}>Téléphone</option>}
          <option value={TerritoryAttributionKind.Campaign}>Campagne de distribution</option>
        </select>
        <select
          className="inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
          name="group"
          defaultValue={params.get('group') ?? undefined}
        >
          <option value="none">Groupe</option>
          {groups.map(group => (
            <option value={group.id} key={group.id}>
              {group.name.toLocaleUpperCase()}
            </option>
          ))}
        </select>
        <select
          className="inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
          name="status"
          defaultValue={params.get('status') ?? undefined}
        >
          <option value="none">Statut</option>
          <option value={'current'}>En cours</option>
          <option value={'late'}>En retard</option>
        </select>
        <input
          type="text"
          name="search"
          className="inline-block appearance-none rounded-sm border border-slate-400 bg-slate-200 p-2 text-slate-950 max-sm:flex-1"
          placeholder="Recherche"
          defaultValue={params.get('search') ?? undefined}
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
