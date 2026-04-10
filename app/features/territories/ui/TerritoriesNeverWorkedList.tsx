import { MapPinOff } from 'lucide-react'
import type { NeverWorkedTerritory } from '~/features/territories/server/territories-never-worked.server'
import { Badge } from '~/shared/ui/badge'
import { EmptyState } from '~/shared/ui/EmptyState'

const MAX_DISPLAY = 20

export default function TerritoriesNeverWorkedList({ territories }: { territories: NeverWorkedTerritory[] }) {
  if (territories.length === 0) {
    return (
      <EmptyState
        icon={MapPinOff}
        title="Tous les territoires ont été travaillés"
        description="Chaque territoire a eu au moins une attribution sur la période."
      />
    )
  }

  const displayed = territories.slice(0, MAX_DISPLAY)
  const remaining = territories.length - MAX_DISPLAY

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {territories.length} territoire{territories.length > 1 ? 's' : ''} sans aucune attribution sur la période :
      </p>
      <div className="flex flex-wrap gap-2">
        {displayed.map(t => (
          <Badge key={t.id} variant="outline">
            {t.number}
          </Badge>
        ))}
        {remaining > 0 && <Badge variant="secondary">+{remaining} autres</Badge>}
      </div>
    </div>
  )
}
