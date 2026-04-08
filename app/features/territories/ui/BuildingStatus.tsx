import type { Building } from '~/database/generated/client'
import { Badge } from '~/shared/ui/badge'

export function BuildingStatus({ building, options }: { building: Building; options: { staleDate: Date } }) {
  if (!building.inTerritory) {
    return (
      <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
        hors territoire
      </Badge>
    )
  }

  if (!building.active) {
    return (
      <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
        inactif
      </Badge>
    )
  }

  if (building.prospectionDate == null || building.prospectionDate < options.staleDate) {
    return (
      <Badge variant="outline" className="border-orange-500 text-orange-500">
        à prospecter
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-green-500 text-green-500">
      actif
    </Badge>
  )
}
