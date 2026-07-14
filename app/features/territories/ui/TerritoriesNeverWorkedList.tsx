import { MapPinOff } from 'lucide-react'
import { Link } from 'react-router'
import type { NeverWorkedTerritory } from '~/features/territories/server/territories-never-worked.server'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { EmptyState } from '~/shared/ui/EmptyState'

interface TerritoriesNeverWorkedListProps {
  territories: NeverWorkedTerritory[]
  isCapped?: boolean
}

export default function TerritoriesNeverWorkedList({ territories, isCapped = false }: TerritoriesNeverWorkedListProps) {
  if (territories.length === 0) {
    return (
      <EmptyState
        icon={MapPinOff}
        title={m.stats_never_worked_all_worked_title()}
        description={m.stats_never_worked_all_worked_desc()}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {territories.length > 1
          ? m.stats_never_worked_count_other({ count: territories.length })
          : m.stats_never_worked_count_one({ count: territories.length })}
      </p>
      <div className="flex flex-wrap gap-2">
        {territories.map(t => (
          <Link
            key={t.id}
            to={`/territories/territory/${t.id}/view`}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Badge variant="outline" className="hover:bg-accent">
              {t.number}
            </Badge>
          </Link>
        ))}
        {isCapped && <Badge variant="secondary">{m.stats_never_worked_more_capped()}</Badge>}
      </div>
    </div>
  )
}
