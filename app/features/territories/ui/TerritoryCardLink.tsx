import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import type { Territory } from '~/database/generated/client'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { AggregatedEntrance } from '~/shared/types/entrance'
import { Card, CardContent } from '~/shared/ui/card'

export function TerritoryCardLink({ territory, entrances }: { territory: Territory; entrances: AggregatedEntrance[] }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="flex flex-col">
          <span className="font-medium">{territory.number}</span>
          <span className="text-muted-foreground text-sm">
            {territory.type === TerritoryKind.Classical && 'Porte à porte'}
            {territory.type === TerritoryKind.Commerces && 'Commerces'}
            {territory.type === TerritoryKind.Phone && 'Téléphones'}
            {territory.type === TerritoryKind.Hotel && 'Hôtels'}
            {territory.type === TerritoryKind.Univ && 'Universités'},{' '}
            {entrances.reduce((aggr, curr) => aggr + (curr.homes ?? curr.phones ?? 0), 0)} portes
          </span>
        </div>
        <Link to={`/territories/territory/${territory.id}/view`} className="text-primary hover:text-primary/80">
          <ExternalLink className="size-5" />
        </Link>
      </CardContent>
    </Card>
  )
}
