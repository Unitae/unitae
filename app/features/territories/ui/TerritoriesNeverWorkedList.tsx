import { MapPinOff } from 'lucide-react'
import type { NeverWorkedTerritory } from '~/features/territories/server/territories-never-worked.server'
import * as m from '~/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { EmptyState } from '~/shared/ui/EmptyState'

const MAX_DISPLAY = 20

export default function TerritoriesNeverWorkedList({ territories }: { territories: NeverWorkedTerritory[] }) {
  if (territories.length === 0) {
    return (
      <EmptyState
        icon={MapPinOff}
        title={m.stats_never_worked_all_worked_title()}
        description={m.stats_never_worked_all_worked_desc()}
      />
    )
  }

  const displayed = territories.slice(0, MAX_DISPLAY)
  const remaining = territories.length - MAX_DISPLAY

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {territories.length > 1
          ? m.stats_never_worked_count_other({ count: territories.length })
          : m.stats_never_worked_count_one({ count: territories.length })}
      </p>
      <div className="flex flex-wrap gap-2">
        {displayed.map(t => (
          <Badge key={t.id} variant="outline">
            {t.number}
          </Badge>
        ))}
        {remaining > 0 && <Badge variant="secondary">{m.stats_never_worked_more({ count: remaining })}</Badge>}
      </div>
    </div>
  )
}
