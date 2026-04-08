import { ArrowUpRightIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router'
import type { Territory } from '~/database/generated/client'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { AggregatedEntrance } from '~/shared/types/entrance'

export function TerritoryCardLink({ territory, entrances }: { territory: Territory; entrances: AggregatedEntrance[] }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
      <div className="flex flex-col">
        <span className="text-slate-950">{territory.number}</span>
        <span className="text-gray-600 text-sm">
          {territory.type === TerritoryKind.Classical && 'Porte à porte'}
          {territory.type === TerritoryKind.Commerces && 'Commerces'}
          {territory.type === TerritoryKind.Phone && 'Téléphones'}
          {territory.type === TerritoryKind.Hotel && 'Hôtels'}
          {territory.type === TerritoryKind.Univ && 'Universités'},{' '}
          {entrances.reduce((aggr, curr) => aggr + (curr.homes ?? curr.phones ?? 0), 0)} portes
        </span>
      </div>
      <div>
        <Link to={`/territories/territory/${territory.id}/edit`} className="text-teal-600">
          <ArrowUpRightIcon className="inline size-6 text-teal-600" />
        </Link>
      </div>
    </div>
  )
}
